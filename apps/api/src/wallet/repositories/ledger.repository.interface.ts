import { LedgerAccount, LedgerEntry, LedgerTransaction, WalletMovementDto } from '@apuestas/shared';

export const LEDGER_REPOSITORY = 'LEDGER_REPOSITORY';

export interface ILedgerRepository {
  findAccountByCode(code: string): Promise<LedgerAccount | null>;
  createAccount(account: Omit<LedgerAccount, 'id' | 'createdAt'>): Promise<LedgerAccount>;
  findEntriesByAccountId(accountId: string): Promise<LedgerEntry[]>;
  findTransactionByIdempotencyKey(key: string): Promise<LedgerTransaction | null>;
  saveTransaction(
    tx: Omit<LedgerTransaction, 'id' | 'createdAt'>,
    entries: Array<Omit<LedgerEntry, 'id' | 'transactionId' | 'createdAt'>>,
  ): Promise<{ transaction: LedgerTransaction; entries: LedgerEntry[] }>;
  getMovementsByUser(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ movements: WalletMovementDto[]; total: number }>;
}
