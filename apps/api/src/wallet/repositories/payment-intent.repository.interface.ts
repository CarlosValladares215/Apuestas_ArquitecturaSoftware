import { PaymentIntentStatus } from '@apuestas/shared';

export const PAYMENT_INTENT_REPOSITORY = 'PAYMENT_INTENT_REPOSITORY';

export interface PaymentIntentRecord {
  id: string;
  userId: string;
  clientTransactionId: string;
  amount: number; // in cents
  currency: 'USD';
  status: PaymentIntentStatus;
  payphoneTxId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IPaymentIntentRepository {
  createIntent(
    intent: Omit<PaymentIntentRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PaymentIntentRecord>;
  findByClientTxId(clientTxId: string): Promise<PaymentIntentRecord | null>;
  updateStatus(
    clientTxId: string,
    status: PaymentIntentStatus,
    payphoneTxId?: string,
  ): Promise<PaymentIntentRecord>;
}
