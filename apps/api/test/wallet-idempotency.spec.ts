import { Test, TestingModule } from '@nestjs/testing';
import { WalletModule } from '../src/wallet/wallet.module';
import { WalletService } from '../src/wallet/services/wallet.service';
import { PayphoneService } from '../src/wallet/services/payphone.service';

describe('Wallet Idempotency and Double-Confirmation (TDD RED)', () => {
  let module: TestingModule;
  let walletService: WalletService;
  let payphoneService: PayphoneService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [WalletModule],
    }).compile();

    walletService = module.get<WalletService>(WalletService);
    payphoneService = module.get<PayphoneService>(PayphoneService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('credits only once when Payphone sends double confirmation for the same transaction', async () => {
    const userId = 'usr_idempotent_bettor_1';

    // 1. Create deposit intent for $25.00
    const intent = await walletService.createDepositIntent({
      userId,
      amountInDollars: 25.0,
      currency: 'USD',
      idempotencyKey: 'IDEMP_INTENT_25',
    });

    expect(intent.status).toBe('PENDING');
    expect(intent.amount).toBe(25.0);

    // Initial balance should be 0.00 (redirect/intent does not credit funds)
    const initialBalance = await walletService.getBalance(userId);
    expect(initialBalance.realBalance).toBe(0.0);

    // Mock successful Payphone sandbox verification
    const payphoneTxId = 'payphone_tx_abc_123';
    jest.spyOn(payphoneService, 'verifyWithPayphone').mockResolvedValue({
      status: 'Approved',
      amountInCents: 2500,
      currency: 'USD',
      clientTransactionId: intent.clientTransactionId,
      payphoneTransactionId: payphoneTxId,
    });

    // 2. First confirmation call
    const firstConfirmation = await walletService.confirmDeposit({
      clientTransactionId: intent.clientTransactionId,
      payphoneTransactionId: payphoneTxId,
      idempotencyKey: 'IDEMP_CONFIRM_1',
    });

    expect(firstConfirmation.success).toBe(true);
    expect(firstConfirmation.status).toBe('COMPLETED');
    expect(firstConfirmation.creditedAmount).toBe(25.0);
    expect(firstConfirmation.newRealBalance).toBe(25.0);

    // Check balance after first confirmation: exactly $25.00
    const balanceAfterFirst = await walletService.getBalance(userId);
    expect(balanceAfterFirst.realBalance).toBe(25.0);

    // Check movements: exactly 1 deposit transaction in the ledger
    const movementsFirst = await walletService.getMovements(userId);
    expect(movementsFirst.movements).toHaveLength(1);

    // 3. Second (duplicate) confirmation call
    const secondConfirmation = await walletService.confirmDeposit({
      clientTransactionId: intent.clientTransactionId,
      payphoneTransactionId: payphoneTxId,
      idempotencyKey: 'IDEMP_CONFIRM_1', // duplicate or replayed confirmation
    });

    expect(secondConfirmation.success).toBe(true);
    expect(secondConfirmation.status).toBe('COMPLETED');

    // CRITICAL INVARIANT: Balance must STILL be $25.00, NOT $50.00!
    const balanceAfterSecond = await walletService.getBalance(userId);
    expect(balanceAfterSecond.realBalance).toBe(25.0);

    // Ledger movements must STILL be exactly 1
    const movementsSecond = await walletService.getMovements(userId);
    expect(movementsSecond.movements).toHaveLength(1);
  });

  it('rejects duplicate debit with the same idempotency key returning original result without re-debiting', async () => {
    const userId = 'usr_idempotent_bettor_2';

    await walletService.creditDeposit({
      userId,
      amountInCents: 10000, // $100.00
      clientTransactionId: 'INITIAL_DEP_100',
      payphoneTransactionId: 'TX_DEP_100',
      idempotencyKey: 'IDEMP_DEP_100',
    });

    const idempotencyKey = 'IDEMP_BET_SINGLE_1';

    // First debit: $30.00
    const debit1 = await walletService.debit({
      userId,
      amountInCents: 3000,
      referenceCode: 'BET_REF_101',
      description: 'First bet placement',
      idempotencyKey,
    });

    expect(debit1.debitedAmount).toBe(30.0);
    expect(debit1.remainingBalance).toBe(70.0);

    // Second debit with identical idempotencyKey
    const debit2 = await walletService.debit({
      userId,
      amountInCents: 3000,
      referenceCode: 'BET_REF_101',
      description: 'First bet placement (retry)',
      idempotencyKey,
    });

    expect(debit2.debitedAmount).toBe(30.0);
    expect(debit2.remainingBalance).toBe(70.0);

    // Remaining balance must remain $70.00 (not $40.00)
    const finalBalance = await walletService.getBalance(userId);
    expect(finalBalance.realBalance).toBe(70.0);
  });
});
