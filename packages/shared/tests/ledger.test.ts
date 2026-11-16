import {
  ACCOUNT_TYPES,
  centsToDollars,
  deriveBalanceFromEntries,
  dollarsToCents,
  LedgerEntryType,
  validateBalancedTransaction,
} from '../src/index';

describe('Shared Ledger Contracts and Pure Financial Helpers', () => {
  it('exposes constitutional account types for separation of funds', () => {
    expect(ACCOUNT_TYPES).toEqual(['user_real', 'user_bonus', 'house', 'gateway']);
  });

  it('converts dollars to cents and cents to dollars avoiding floating point drift', () => {
    expect(dollarsToCents(10)).toBe(1000);
    expect(dollarsToCents(10.55)).toBe(1055);
    expect(dollarsToCents(0.99)).toBe(99);

    expect(centsToDollars(1000)).toBe(10);
    expect(centsToDollars(1055)).toBe(10.55);
    expect(centsToDollars(99)).toBe(0.99);
  });

  it('validates double-entry transaction balance (sum of debits equals sum of credits)', () => {
    const balancedEntries = [
      { entryType: 'DEBIT' as LedgerEntryType, amount: 2500 },
      { entryType: 'CREDIT' as LedgerEntryType, amount: 2500 },
    ];
    expect(validateBalancedTransaction(balancedEntries)).toBe(true);

    const unbalancedEntries = [
      { entryType: 'DEBIT' as LedgerEntryType, amount: 2500 },
      { entryType: 'CREDIT' as LedgerEntryType, amount: 1000 },
    ];
    expect(validateBalancedTransaction(unbalancedEntries)).toBe(false);

    const nonPositiveEntries = [
      { entryType: 'DEBIT' as LedgerEntryType, amount: 0 },
      { entryType: 'CREDIT' as LedgerEntryType, amount: 0 },
    ];
    expect(validateBalancedTransaction(nonPositiveEntries)).toBe(false);
  });

  it('derives user balance from ledger entries (credits increase, debits decrease)', () => {
    const entries = [
      { entryType: 'CREDIT' as LedgerEntryType, amount: 5000 }, // +50.00
      { entryType: 'DEBIT' as LedgerEntryType, amount: 1500 }, // -15.00
      { entryType: 'CREDIT' as LedgerEntryType, amount: 2000 }, // +20.00
      { entryType: 'DEBIT' as LedgerEntryType, amount: 500 }, // -5.00
    ];

    const balanceInCents = deriveBalanceFromEntries(entries);
    expect(balanceInCents).toBe(5000); // 5000 - 1500 + 2000 - 500 = 5000 cents ($50.00)
    expect(centsToDollars(balanceInCents)).toBe(50.0);
  });
});
