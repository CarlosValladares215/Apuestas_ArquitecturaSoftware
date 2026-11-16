import { Inject, Injectable } from '@nestjs/common';
import {
  AccountType,
  deriveBalanceFromEntries,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryType,
  LedgerTransaction,
  TransactionType,
  WalletMovementDto,
} from '@apuestas/shared';
import { ILedgerRepository, LEDGER_REPOSITORY } from '../repositories/ledger.repository.interface';

@Injectable()
export class LedgerService {
  constructor(
    @Inject(LEDGER_REPOSITORY)
    private readonly ledgerRepository: ILedgerRepository,
  ) {}

  /**
   * Retrieves or initializes an account in the chart of accounts.
   */
  async getOrCreateAccount(
    code: string,
    type: AccountType,
    userId?: string,
    currency: 'USD' = 'USD',
  ): Promise<LedgerAccount> {
    const existing = await this.ledgerRepository.findAccountByCode(code);
    if (existing) {
      return existing;
    }
    return this.ledgerRepository.createAccount({
      code,
      type,
      userId,
      currency,
    });
  }

  async getUserRealAccount(userId: string): Promise<LedgerAccount> {
    return this.getOrCreateAccount(`user_real:${userId}`, 'user_real', userId);
  }

  async getUserBonusAccount(userId: string): Promise<LedgerAccount> {
    return this.getOrCreateAccount(`user_bonus:${userId}`, 'user_bonus', userId);
  }

  async getHouseAccount(purpose = 'main'): Promise<LedgerAccount> {
    return this.getOrCreateAccount(`house:${purpose}`, 'house');
  }

  async getGatewayAccount(gateway = 'payphone'): Promise<LedgerAccount> {
    return this.getOrCreateAccount(`gateway:${gateway}`, 'gateway');
  }

  /**
   * Derives balance strictly from ledger entries (sum of credits minus sum of debits).
   * Returns balance in cents (integer).
   */
  async getAccountBalanceInCents(accountId: string): Promise<number> {
    const entries = await this.ledgerRepository.findEntriesByAccountId(accountId);
    return deriveBalanceFromEntries(entries);
  }

  /**
   * Executes an atomic, immutable double-entry transaction.
   * Enforces: Sum(Debits) === Sum(Credits).
   */
  async recordDoubleEntryTransaction(params: {
    referenceCode: string;
    type: TransactionType;
    description: string;
    idempotencyKey: string;
    entries: Array<{
      accountId: string;
      entryType: LedgerEntryType;
      amount: number; // in cents
    }>;
  }): Promise<{ transaction: LedgerTransaction; entries: LedgerEntry[] }> {
    const existing = await this.ledgerRepository.findTransactionByIdempotencyKey(
      params.idempotencyKey,
    );
    if (existing) {
      const existingEntries = await this.ledgerRepository.findEntriesByAccountId(
        params.entries[0]?.accountId ?? '',
      );
      return {
        transaction: existing,
        entries: existingEntries.filter((e) => e.transactionId === existing.id),
      };
    }

    return this.ledgerRepository.saveTransaction(
      {
        referenceCode: params.referenceCode,
        type: params.type,
        description: params.description,
        idempotencyKey: params.idempotencyKey,
      },
      params.entries,
    );
  }

  /**
   * Creates a compensating transaction to reverse or correct a past entry.
   * Never mutates or deletes original entries (Constitution Principle II).
   */
  async recordCompensatingTransaction(params: {
    originalTransaction: LedgerTransaction;
    originalEntries: LedgerEntry[];
    reason: string;
    idempotencyKey: string;
  }): Promise<{ transaction: LedgerTransaction; entries: LedgerEntry[] }> {
    // Invert entry types (Debits become Credits and vice-versa)
    const compensatingEntries: Array<{
      accountId: string;
      entryType: LedgerEntryType;
      amount: number;
    }> = params.originalEntries.map((e) => ({
      accountId: e.accountId,
      entryType: e.entryType === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: e.amount,
    }));

    return this.recordDoubleEntryTransaction({
      referenceCode: `COMP-${params.originalTransaction.referenceCode}`,
      type: 'COMPENSATION',
      description: `Asiento compensatorio: ${params.reason}`,
      idempotencyKey: params.idempotencyKey,
      entries: compensatingEntries,
    });
  }

  async getMovementsByUser(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ movements: WalletMovementDto[]; total: number }> {
    // Ensure accounts exist
    await this.getUserRealAccount(userId);
    await this.getUserBonusAccount(userId);
    return this.ledgerRepository.getMovementsByUser(userId, limit, offset);
  }
}
