import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AccountType,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryType,
  LedgerTransaction,
  PaymentIntentStatus,
  TransactionType,
  WalletMovementDto,
  centsToDollars,
  validateBalancedTransaction,
} from '@apuestas/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ILedgerRepository } from './ledger.repository.interface';
import {
  IPaymentIntentRepository,
  PaymentIntentRecord,
} from './payment-intent.repository.interface';
import { IWalletRepository, WalletRecord } from './wallet.repository.interface';

type DbClient = PrismaService | Prisma.TransactionClient;

function mapAccount(row: {
  id: string;
  code: string;
  type: string;
  userId: string | null;
  currency: string;
  createdAt: Date;
}): LedgerAccount {
  return {
    id: row.id,
    code: row.code,
    type: row.type as AccountType,
    userId: row.userId,
    currency: 'USD',
    createdAt: row.createdAt.toISOString(),
  };
}

function mapTransaction(row: {
  id: string;
  referenceCode: string;
  type: string;
  description: string;
  idempotencyKey: string;
  createdAt: Date;
}): LedgerTransaction {
  return {
    id: row.id,
    referenceCode: row.referenceCode,
    type: row.type as TransactionType,
    description: row.description,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapEntry(row: {
  id: string;
  transactionId: string;
  accountId: string;
  entryType: string;
  amountCents: bigint;
  createdAt: Date;
}): LedgerEntry {
  return {
    id: row.id,
    transactionId: row.transactionId,
    accountId: row.accountId,
    entryType: row.entryType as LedgerEntryType,
    amount: Number(row.amountCents),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPaymentIntent(row: {
  id: string;
  userId: string;
  clientTransactionId: string;
  amountCents: bigint;
  currency: string;
  status: string;
  payphoneTxId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PaymentIntentRecord {
  return {
    id: row.id,
    userId: row.userId,
    clientTransactionId: row.clientTransactionId,
    amount: Number(row.amountCents),
    currency: 'USD',
    status: row.status as PaymentIntentStatus,
    payphoneTxId: row.payphoneTxId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaWalletLedgerRepository
  implements ILedgerRepository, IWalletRepository, IPaymentIntentRepository
{
  private readonly txStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaService) {}

  private get db(): DbClient {
    return this.txStorage.getStore() ?? this.prisma;
  }

  async getOrCreateWallet(userId: string): Promise<WalletRecord> {
    const row = await this.db.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        currency: 'USD',
      },
    });

    return {
      id: row.id,
      userId: row.userId,
      currency: 'USD',
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Acquires an exclusive PostgreSQL row lock (SELECT ... FOR UPDATE) inside a single transaction
   * and propagates the transaction client cleanly via AsyncLocalStorage.
   */
  async withLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const activeTx = this.txStorage.getStore();
    if (activeTx) {
      return task();
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId },
        update: {},
        create: { userId, currency: 'USD' },
      });

      await tx.$executeRaw`SELECT id FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;

      return this.txStorage.run(tx, task);
    });
  }

  async findAccountByCode(code: string): Promise<LedgerAccount | null> {
    const row = await this.db.ledgerAccount.findUnique({ where: { code } });
    return row ? mapAccount(row) : null;
  }

  async createAccount(account: Omit<LedgerAccount, 'id' | 'createdAt'>): Promise<LedgerAccount> {
    const row = await this.db.ledgerAccount.upsert({
      where: { code: account.code },
      update: {},
      create: {
        code: account.code,
        type: account.type,
        userId: account.userId ?? null,
        currency: account.currency,
      },
    });
    return mapAccount(row);
  }

  async findEntriesByAccountId(accountId: string): Promise<LedgerEntry[]> {
    const rows = await this.db.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapEntry);
  }

  async findTransactionByIdempotencyKey(key: string): Promise<LedgerTransaction | null> {
    const row = await this.db.ledgerTransaction.findUnique({
      where: { idempotencyKey: key },
    });
    return row ? mapTransaction(row) : null;
  }

  async saveTransaction(
    txData: Omit<LedgerTransaction, 'id' | 'createdAt'>,
    entries: Array<Omit<LedgerEntry, 'id' | 'transactionId' | 'createdAt'>>,
  ): Promise<{ transaction: LedgerTransaction; entries: LedgerEntry[] }> {
    if (!validateBalancedTransaction(entries)) {
      throw new Error(
        `Violación de partida doble: la transacción '${txData.referenceCode}' no balancea debits y credits.`,
      );
    }

    const executeSave = async (client: DbClient) => {
      const existing = await client.ledgerTransaction.findUnique({
        where: { idempotencyKey: txData.idempotencyKey },
        include: { entries: true },
      });

      if (existing) {
        return {
          transaction: mapTransaction(existing),
          entries: existing.entries.map(mapEntry),
        };
      }

      const created = await client.ledgerTransaction.create({
        data: {
          referenceCode: txData.referenceCode,
          type: txData.type,
          description: txData.description,
          idempotencyKey: txData.idempotencyKey,
          entries: {
            create: entries.map((entry) => ({
              accountId: entry.accountId,
              entryType: entry.entryType,
              amountCents: BigInt(entry.amount),
            })),
          },
        },
        include: { entries: true },
      });

      return {
        transaction: mapTransaction(created),
        entries: created.entries.map(mapEntry),
      };
    };

    const currentTx = this.txStorage.getStore();
    if (currentTx) {
      return executeSave(currentTx);
    }

    return this.prisma.$transaction((tx) => executeSave(tx));
  }

  async getMovementsByUser(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ movements: WalletMovementDto[]; total: number }> {
    const accounts = await this.db.ledgerAccount.findMany({
      where: {
        code: {
          in: [`user_real:${userId}`, `user_bonus:${userId}`],
        },
      },
    });

    if (accounts.length === 0) {
      return { movements: [], total: 0 };
    }

    const accountTypeById = new Map<string, AccountType>();
    for (const acc of accounts) {
      accountTypeById.set(acc.id, acc.type as AccountType);
    }
    const accountIds = accounts.map((acc) => acc.id);

    const [rows, total] = await Promise.all([
      this.db.ledgerEntry.findMany({
        where: { accountId: { in: accountIds } },
        include: { transaction: true },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.db.ledgerEntry.count({
        where: { accountId: { in: accountIds } },
      }),
    ]);

    return {
      movements: rows.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        referenceCode: entry.transaction.referenceCode,
        type: entry.transaction.type as TransactionType,
        accountType: accountTypeById.get(entry.accountId) ?? 'user_real',
        entryType: entry.entryType as LedgerEntryType,
        amount: centsToDollars(Number(entry.amountCents)),
        description: entry.transaction.description,
        createdAt: entry.createdAt.toISOString(),
      })),
      total,
    };
  }

  async createIntent(
    intent: Omit<PaymentIntentRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PaymentIntentRecord> {
    const created = await this.db.paymentIntent.create({
      data: {
        userId: intent.userId,
        clientTransactionId: intent.clientTransactionId,
        amountCents: BigInt(intent.amount),
        currency: intent.currency,
        status: intent.status,
        payphoneTxId: intent.payphoneTxId ?? null,
      },
    });
    return mapPaymentIntent(created);
  }

  async findByClientTxId(clientTxId: string): Promise<PaymentIntentRecord | null> {
    const row = await this.db.paymentIntent.findUnique({
      where: { clientTransactionId: clientTxId },
    });
    return row ? mapPaymentIntent(row) : null;
  }

  async updateStatus(
    clientTxId: string,
    status: PaymentIntentStatus,
    payphoneTxId?: string,
  ): Promise<PaymentIntentRecord> {
    const existing = await this.db.paymentIntent.findUnique({
      where: { clientTransactionId: clientTxId },
    });
    if (!existing) {
      throw new NotFoundException(`Intención de pago '${clientTxId}' no encontrada.`);
    }

    const updated = await this.db.paymentIntent.update({
      where: { clientTransactionId: clientTxId },
      data: {
        status,
        ...(payphoneTxId !== undefined ? { payphoneTxId } : {}),
      },
    });
    return mapPaymentIntent(updated);
  }
}
