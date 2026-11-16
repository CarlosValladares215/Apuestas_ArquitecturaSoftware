import { Test, TestingModule } from '@nestjs/testing';
import { WalletModule } from '../src/wallet/wallet.module';
import { WalletService } from '../src/wallet/services/wallet.service';
import { PayphoneService } from '../src/wallet/services/payphone.service';
import { InsufficientFundsException } from '../src/wallet/exceptions/insufficient-funds.exception';
import { PaymentTamperedException } from '../src/wallet/exceptions/payment-tampered.exception';

describe('Payphone Tampering Rejection and Anti-Abuse (TDD RED)', () => {
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

  it('rejects deposit confirmation when Payphone reports an altered amount (tampering)', async () => {
    const userId = 'usr_victim_or_attacker_1';

    // 1. Registered intent: $20.00 (2000 cents)
    const intent = await walletService.createDepositIntent({
      userId,
      amountInDollars: 20.0,
      currency: 'USD',
      idempotencyKey: 'IDEMP_TAMPER_INTENT_1',
    });

    // 2. Mock Payphone returning altered amount ($200.00 / 20000 cents)
    jest.spyOn(payphoneService, 'verifyWithPayphone').mockResolvedValue({
      status: 'Approved',
      amountInCents: 20000, // Altered!
      currency: 'USD',
      clientTransactionId: intent.clientTransactionId,
      payphoneTransactionId: 'TX_TAMPERED_AMOUNT',
    });

    // 3. Attempt confirmation
    await expect(
      walletService.confirmDeposit({
        clientTransactionId: intent.clientTransactionId,
        payphoneTransactionId: 'TX_TAMPERED_AMOUNT',
        idempotencyKey: 'IDEMP_TAMPER_CONFIRM_1',
      }),
    ).rejects.toThrow(PaymentTamperedException);

    // CRITICAL: Ledger must NOT be credited and balance remains 0
    const balance = await walletService.getBalance(userId);
    expect(balance.realBalance).toBe(0.0);

    const movements = await walletService.getMovements(userId);
    expect(movements.movements).toHaveLength(0);
  });

  it('rejects deposit confirmation when currency is not USD', async () => {
    const userId = 'usr_foreign_currency_1';

    const intent = await walletService.createDepositIntent({
      userId,
      amountInDollars: 15.0,
      currency: 'USD',
      idempotencyKey: 'IDEMP_CURRENCY_INTENT_1',
    });

    jest.spyOn(payphoneService, 'verifyWithPayphone').mockResolvedValue({
      status: 'Approved',
      amountInCents: 1500,
      currency: 'EUR', // Altered currency!
      clientTransactionId: intent.clientTransactionId,
      payphoneTransactionId: 'TX_TAMPERED_CURRENCY',
    });

    await expect(
      walletService.confirmDeposit({
        clientTransactionId: intent.clientTransactionId,
        payphoneTransactionId: 'TX_TAMPERED_CURRENCY',
        idempotencyKey: 'IDEMP_CURRENCY_CONFIRM_1',
      }),
    ).rejects.toThrow(PaymentTamperedException);

    const balance = await walletService.getBalance(userId);
    expect(balance.realBalance).toBe(0.0);
  });

  it('rejects debit request when wallet balance is insufficient', async () => {
    const userId = 'usr_broke_bettor_1';

    // Seed wallet with $5.00
    await walletService.creditDeposit({
      userId,
      amountInCents: 500, // $5.00
      clientTransactionId: 'DEP_INIT_5',
      payphoneTransactionId: 'TX_INIT_5',
      idempotencyKey: 'IDEMP_INIT_5',
    });

    // Attempt to debit $10.00
    await expect(
      walletService.debit({
        userId,
        amountInCents: 1000, // $10.00
        referenceCode: 'BET_OVERDRAW_1',
        description: 'Overdrawn bet',
        idempotencyKey: 'IDEMP_OVERDRAW_1',
      }),
    ).rejects.toThrow(InsufficientFundsException);

    // Balance remains intact at $5.00
    const balance = await walletService.getBalance(userId);
    expect(balance.realBalance).toBe(5.0);
  });
});
