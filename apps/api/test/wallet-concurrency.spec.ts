import { Test, TestingModule } from '@nestjs/testing';
import { WalletModule } from '../src/wallet/wallet.module';
import { WalletService } from '../src/wallet/services/wallet.service';
import { InsufficientFundsException } from '../src/wallet/exceptions/insufficient-funds.exception';

describe('Wallet Concurrency and Anti-Double-Spending (TDD RED)', () => {
  let module: TestingModule;
  let walletService: WalletService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [WalletModule],
    }).compile();

    walletService = module.get<WalletService>(WalletService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('prevents double spending under N concurrent debits on the same wallet', async () => {
    const userId = 'usr_concurrent_debtor_1';
    // Initial deposit: $50.00
    await walletService.creditDeposit({
      userId,
      amountInCents: 5000,
      clientTransactionId: 'INITIAL_DEP_50',
      payphoneTransactionId: 'TX_INIT_50',
      idempotencyKey: 'IDEMP_INIT_50',
    });

    const initialBalance = await walletService.getBalance(userId);
    expect(initialBalance.realBalance).toBe(50.0);

    // 10 concurrent debit attempts of $10.00 each
    const concurrencyAttempts = 10;
    const debitAmountInCents = 1000; // $10.00 each

    const promises = Array.from({ length: concurrencyAttempts }, (_, i) =>
      walletService
        .debit({
          userId,
          amountInCents: debitAmountInCents,
          referenceCode: `BET_CONCURRENT_${String(i)}`,
          description: `Concurrent bet attempt #${String(i)}`,
          idempotencyKey: `IDEMP_BET_CONCURRENT_${String(i)}`,
        })
        .then(() => ({ success: true, error: null as unknown }))
        .catch((err: unknown) => ({ success: false, error: err })),
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly 5 should succeed ($50 / $10 = 5)
    expect(successes).toHaveLength(5);
    // Exactly 5 should fail due to insufficient funds
    expect(failures).toHaveLength(5);
    failures.forEach((f) => {
      expect(f.error).toBeInstanceOf(InsufficientFundsException);
    });

    // Final balance derived from ledger MUST be exactly $0.00 (0 cents) - zero overdraw
    const finalBalance = await walletService.getBalance(userId);
    expect(finalBalance.realBalance).toBe(0.0);
    expect(finalBalance.bonusBalance).toBe(0.0);
  });

  it('correctly aggregates N concurrent deposits without lost updates', async () => {
    const userId = 'usr_concurrent_depositor_2';
    const depositCount = 10;
    const depositAmountInCents = 1000; // $10.00 each

    const promises = Array.from({ length: depositCount }, (_, i) =>
      walletService.creditDeposit({
        userId,
        amountInCents: depositAmountInCents,
        clientTransactionId: `DEP_CONCURRENT_${String(i)}`,
        payphoneTransactionId: `TX_DEP_CONCURRENT_${String(i)}`,
        idempotencyKey: `IDEMP_DEP_CONCURRENT_${String(i)}`,
      }),
    );

    await Promise.all(promises);

    const finalBalance = await walletService.getBalance(userId);
    // 10 deposits of $10 = $100.00
    expect(finalBalance.realBalance).toBe(100.0);
  });
});
