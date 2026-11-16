import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  centsToDollars,
  LedgerAccount,
  LedgerEntry,
  LedgerTransaction,
  PaymentIntentStatus,
  validateBalancedTransaction,
  WalletMovementDto,
} from '@apuestas/shared';
import { ILedgerRepository } from './ledger.repository.interface';
import { IWalletRepository, WalletRecord } from './wallet.repository.interface';
import {
  IPaymentIntentRepository,
  PaymentIntentRecord,
} from './payment-intent.repository.interface';
import { IAuditLogRepository, AuditLogRecord } from './audit-log.repository.interface';

@Injectable()
export class InMemoryLedgerRepository
  implements ILedgerRepository, IWalletRepository, IPaymentIntentRepository, IAuditLogRepository
{
  private readonly wallets = new Map<string, WalletRecord>();
  private readonly accounts = new Map<string, LedgerAccount>(); // key: code
  private readonly transactions = new Map<string, LedgerTransaction>(); // key: id
  private readonly transactionsByIdempotency = new Map<string, LedgerTransaction>();
  private readonly entries: LedgerEntry[] = [];
  private readonly paymentIntents = new Map<string, PaymentIntentRecord>(); // key: clientTransactionId
  private readonly auditLogs: AuditLogRecord[] = [];

  // Mutex per user to strictly simulate PostgreSQL SELECT ... FOR UPDATE row-level locking
  private readonly userLocks = new Map<string, Promise<unknown>>();

  /* -------------------------------------------------------------------------- */
  /* WALLET REPOSITORY & PESSIMISTIC LOCKING                                    */
  /* -------------------------------------------------------------------------- */

  async getOrCreateWallet(userId: string): Promise<WalletRecord> {
    await Promise.resolve();
    let wallet = this.wallets.get(userId);
    if (!wallet) {
      wallet = {
        id: randomUUID(),
        userId,
        currency: 'USD',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.wallets.set(userId, wallet);
    }
    return wallet;
  }

  /**
   * Serializes operations on the user's wallet, exactly mirroring PostgreSQL
   * row locking (`SELECT ... FOR UPDATE`).
   */
  async withLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const currentLock = this.userLocks.get(userId) || Promise.resolve();

    let releaseLock: (() => void) | undefined;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Chain the task to the current lock queue for this user
    this.userLocks.set(userId, nextLock);

    try {
      await currentLock;
      return await task();
    } finally {
      if (releaseLock) {
        releaseLock();
      }
      if (this.userLocks.get(userId) === nextLock) {
        this.userLocks.delete(userId);
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /* LEDGER REPOSITORY                                                          */
  /* -------------------------------------------------------------------------- */

  async findAccountByCode(code: string): Promise<LedgerAccount | null> {
    await Promise.resolve();
    return this.accounts.get(code) || null;
  }

  async createAccount(account: Omit<LedgerAccount, 'id' | 'createdAt'>): Promise<LedgerAccount> {
    await Promise.resolve();
    const existing = this.accounts.get(account.code);
    if (existing) {
      return existing;
    }

    const created: LedgerAccount = {
      ...account,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.accounts.set(created.code, created);
    return created;
  }

  async findEntriesByAccountId(accountId: string): Promise<LedgerEntry[]> {
    await Promise.resolve();
    return this.entries.filter((entry) => entry.accountId === accountId);
  }

  async findTransactionByIdempotencyKey(key: string): Promise<LedgerTransaction | null> {
    await Promise.resolve();
    return this.transactionsByIdempotency.get(key) || null;
  }

  async saveTransaction(
    tx: Omit<LedgerTransaction, 'id' | 'createdAt'>,
    entries: Array<Omit<LedgerEntry, 'id' | 'transactionId' | 'createdAt'>>,
  ): Promise<{ transaction: LedgerTransaction; entries: LedgerEntry[] }> {
    await Promise.resolve();
    // 1. Double-entry validation check
    const isBalanced = validateBalancedTransaction(entries);
    if (!isBalanced) {
      throw new Error(
        `Violación de partida doble: la transacción '${tx.referenceCode}' no balancea debits y credits o contiene montos no positivos`,
      );
    }

    // 2. Check idempotency
    const existingTx = this.transactionsByIdempotency.get(tx.idempotencyKey);
    if (existingTx) {
      const existingEntries = this.entries.filter((e) => e.transactionId === existingTx.id);
      return { transaction: existingTx, entries: existingEntries };
    }

    const transactionId = randomUUID();
    const now = new Date().toISOString();

    const createdTransaction: LedgerTransaction = {
      ...tx,
      id: transactionId,
      createdAt: now,
    };

    const createdEntries: LedgerEntry[] = entries.map((e) => ({
      ...e,
      id: randomUUID(),
      transactionId,
      createdAt: now,
    }));

    // Invariant: Append-only persistence
    this.transactions.set(transactionId, createdTransaction);
    this.transactionsByIdempotency.set(tx.idempotencyKey, createdTransaction);
    this.entries.push(...createdEntries);

    return {
      transaction: createdTransaction,
      entries: createdEntries,
    };
  }

  async getMovementsByUser(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ movements: WalletMovementDto[]; total: number }> {
    await Promise.resolve();
    const userRealAccount = this.accounts.get(`user_real:${userId}`);
    const userBonusAccount = this.accounts.get(`user_bonus:${userId}`);

    const targetAccountIds = new Set<string>();
    if (userRealAccount) targetAccountIds.add(userRealAccount.id);
    if (userBonusAccount) targetAccountIds.add(userBonusAccount.id);

    if (targetAccountIds.size === 0) {
      return { movements: [], total: 0 };
    }

    const userEntries = this.entries.filter((e) => targetAccountIds.has(e.accountId));

    // Map entries to movements with transaction metadata
    const allMovements: WalletMovementDto[] = userEntries
      .map((entry) => {
        const tx = this.transactions.get(entry.transactionId);
        const account = Array.from(this.accounts.values()).find((a) => a.id === entry.accountId);

        return {
          id: entry.id,
          transactionId: entry.transactionId,
          referenceCode: tx?.referenceCode ?? 'UNKNOWN',
          type: tx?.type ?? 'DEPOSIT',
          accountType: account?.type ?? 'user_real',
          entryType: entry.entryType,
          amount: centsToDollars(entry.amount),
          description: tx?.description ?? '',
          createdAt: entry.createdAt,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allMovements.length;
    const paginated = allMovements.slice(offset, offset + limit);

    return { movements: paginated, total };
  }

  /* -------------------------------------------------------------------------- */
  /* PAYMENT INTENT REPOSITORY                                                  */
  /* -------------------------------------------------------------------------- */

  async createIntent(
    intent: Omit<PaymentIntentRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PaymentIntentRecord> {
    await Promise.resolve();
    const now = new Date().toISOString();
    const created: PaymentIntentRecord = {
      ...intent,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.paymentIntents.set(created.clientTransactionId, created);
    return created;
  }

  async findByClientTxId(clientTxId: string): Promise<PaymentIntentRecord | null> {
    await Promise.resolve();
    return this.paymentIntents.get(clientTxId) || null;
  }

  async updateStatus(
    clientTxId: string,
    status: PaymentIntentStatus,
    payphoneTxId?: string,
  ): Promise<PaymentIntentRecord> {
    await Promise.resolve();
    const existing = this.paymentIntents.get(clientTxId);
    if (!existing) {
      throw new Error(`Intención de pago '${clientTxId}' no encontrada`);
    }

    const updated: PaymentIntentRecord = {
      ...existing,
      status,
      payphoneTxId: payphoneTxId ?? existing.payphoneTxId,
      updatedAt: new Date().toISOString(),
    };

    this.paymentIntents.set(clientTxId, updated);
    return updated;
  }

  /* -------------------------------------------------------------------------- */
  /* AUDIT LOG REPOSITORY                                                       */
  /* -------------------------------------------------------------------------- */

  async record(log: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<AuditLogRecord> {
    await Promise.resolve();
    const created: AuditLogRecord = {
      ...log,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.push(created);
    return created;
  }

  async findByUser(userId: string): Promise<AuditLogRecord[]> {
    await Promise.resolve();
    return this.auditLogs.filter((l) => l.userId === userId);
  }
}
