export const WALLET_REPOSITORY = 'WALLET_REPOSITORY';

export interface WalletRecord {
  id: string;
  userId: string;
  currency: 'USD';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface IWalletRepository {
  getOrCreateWallet(userId: string): Promise<WalletRecord>;
  /**
   * Executes a transactional callback with exclusive pessimistic row lock (SELECT ... FOR UPDATE)
   * on the user's wallet to ensure serialization and prevent race conditions / double spending.
   */
  withLock<T>(userId: string, task: () => Promise<T>): Promise<T>;
}
