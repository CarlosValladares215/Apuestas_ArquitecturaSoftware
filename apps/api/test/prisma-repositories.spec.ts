import { PrismaMatchesRepository } from '../src/matches/repositories/prisma-matches.repository';
import { PrismaWalletLedgerRepository } from '../src/wallet/repositories/prisma-ledger.repository';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Prisma Repositories (Unit Verification with Mocked PrismaService)', () => {
  describe('PrismaWalletLedgerRepository', () => {
    it('acquires PostgreSQL row lock FOR UPDATE inside $transaction and executes double-entry save idempotently', async () => {
      const executeRawMock = jest.fn().mockResolvedValue(1);
      const walletUpsertMock = jest.fn().mockResolvedValue({
        id: 'wallet-uuid-1',
        userId: '11111111-1111-4111-8111-111111111111',
        currency: 'USD',
        version: 1,
        createdAt: new Date('2026-11-15T12:00:00.000Z'),
        updatedAt: new Date('2026-11-15T12:00:00.000Z'),
      });
      const txFindUniqueMock = jest.fn().mockResolvedValue(null);
      const txCreateMock = jest.fn().mockResolvedValue({
        id: 'tx-uuid-1',
        referenceCode: 'DEP_1',
        type: 'DEPOSIT',
        description: 'Recarga Payphone',
        idempotencyKey: 'idemp_dep_1',
        createdAt: new Date('2026-11-15T12:01:00.000Z'),
        entries: [
          {
            id: 'entry-1',
            transactionId: 'tx-uuid-1',
            accountId: 'acc-sys',
            entryType: 'DEBIT',
            amountCents: BigInt(2500),
            createdAt: new Date('2026-11-15T12:01:00.000Z'),
          },
          {
            id: 'entry-2',
            transactionId: 'tx-uuid-1',
            accountId: 'acc-usr',
            entryType: 'CREDIT',
            amountCents: BigInt(2500),
            createdAt: new Date('2026-11-15T12:01:00.000Z'),
          },
        ],
      });

      const txClient = {
        wallet: { upsert: walletUpsertMock },
        $executeRaw: executeRawMock,
        ledgerTransaction: {
          findUnique: txFindUniqueMock,
          create: txCreateMock,
        },
      };

      const prismaMock = {
        $transaction: jest.fn((callback: (tx: typeof txClient) => Promise<unknown>) =>
          callback(txClient),
        ),
        wallet: { upsert: walletUpsertMock },
        ledgerAccount: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
        ledgerEntry: { findMany: jest.fn(), count: jest.fn() },
        ledgerTransaction: { findUnique: txFindUniqueMock, create: txCreateMock },
        paymentIntent: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      } as unknown as PrismaService;

      const repository = new PrismaWalletLedgerRepository(prismaMock);

      const saved = await repository.withLock('11111111-1111-4111-8111-111111111111', async () =>
        repository.saveTransaction(
          {
            referenceCode: 'DEP_1',
            type: 'DEPOSIT',
            description: 'Recarga Payphone',
            idempotencyKey: 'idemp_dep_1',
          },
          [
            { accountId: 'acc-sys', entryType: 'DEBIT', amount: 2500 },
            { accountId: 'acc-usr', entryType: 'CREDIT', amount: 2500 },
          ],
        ),
      );

      expect(walletUpsertMock).toHaveBeenCalledTimes(1);
      expect(executeRawMock).toHaveBeenCalledTimes(1);
      const rawQueryArgs = executeRawMock.mock.calls[0] as [TemplateStringsArray, string];
      expect(rawQueryArgs[0].join('?')).toContain('SELECT id FROM wallets WHERE user_id =');
      expect(rawQueryArgs[0].join('?')).toContain('FOR UPDATE');
      expect(txCreateMock).toHaveBeenCalledTimes(1);
      expect(saved.entries[0]?.amount).toBe(2500);
      expect(saved.entries[1]?.amount).toBe(2500);
    });

    it('rejects unbalanced double-entry ledger writes before touching Prisma', async () => {
      const prismaMock = {
        $transaction: jest.fn(),
      } as unknown as PrismaService;
      const repository = new PrismaWalletLedgerRepository(prismaMock);

      await expect(
        repository.saveTransaction(
          {
            referenceCode: 'DEP_BAD',
            type: 'DEPOSIT',
            description: 'Unbalanced attempt',
            idempotencyKey: 'idemp_bad',
          },
          [
            { accountId: 'acc-sys', entryType: 'DEBIT', amount: 1000 },
            { accountId: 'acc-usr', entryType: 'CREDIT', amount: 2000 },
          ],
        ),
      ).rejects.toThrow(/partida doble/i);
    });

    it('maps getMovementsByUser BigInt cents cleanly to USD movements', async () => {
      const prismaMock = {
        ledgerAccount: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'acc-real-1',
              code: 'user_real:u-1',
              type: 'user_real',
              userId: 'u-1',
              currency: 'USD',
              createdAt: new Date('2026-11-15T10:00:00.000Z'),
            },
          ]),
        },
        ledgerEntry: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'entry-1',
              transactionId: 'tx-1',
              accountId: 'acc-real-1',
              entryType: 'CREDIT',
              amountCents: BigInt(1525),
              createdAt: new Date('2026-11-15T12:00:00.000Z'),
              transaction: {
                id: 'tx-1',
                referenceCode: 'DEP_TX1',
                type: 'DEPOSIT',
                description: 'Depósito sandbox',
                idempotencyKey: 'idemp_1',
                createdAt: new Date('2026-11-15T12:00:00.000Z'),
              },
            },
          ]),
          count: jest.fn().mockResolvedValue(1),
        },
      } as unknown as PrismaService;

      const repository = new PrismaWalletLedgerRepository(prismaMock);
      const result = await repository.getMovementsByUser('u-1', 10, 0);

      expect(result.total).toBe(1);
      expect(result.movements[0]).toEqual(
        expect.objectContaining({
          id: 'entry-1',
          accountType: 'user_real',
          entryType: 'CREDIT',
          amount: 15.25,
          referenceCode: 'DEP_TX1',
        }),
      );
    });
  });

  describe('PrismaMatchesRepository', () => {
    it('maps match rows and numeric odds from Decimal cleanly and persists quota state', async () => {
      const findManyMock = jest.fn().mockResolvedValue([
        {
          id: 'match_1',
          competitionId: 'comp_ligapro',
          externalId: 12345,
          homeTeam: 'LDU Quito',
          awayTeam: 'Barcelona SC',
          kickoffAt: new Date('2026-11-16T20:00:00.000Z'),
          status: 'programado',
          homeScore: 0,
          awayScore: 0,
          elapsedMinute: null,
          updatedAt: new Date('2026-11-15T18:00:00.000Z'),
          competition: {
            id: 'comp_ligapro',
            name: 'LigaPro Serie A',
            country: 'Ecuador',
            sport: 'football',
            externalId: 242,
          },
          markets: [
            {
              id: 'mkt_1',
              matchId: 'match_1',
              type: 'match_winner_1x2',
              name: 'Resultado Final (1X2)',
              isPreMatch: true,
              status: 'open',
              closedReason: null,
              selections: [
                {
                  id: 'sel_1',
                  marketId: 'mkt_1',
                  key: 'HOME',
                  label: 'LDU Quito',
                  odds: '1.9500',
                },
              ],
            },
          ],
        },
      ]);

      const quotaUpsertMock = jest.fn().mockResolvedValue({
        id: 'default',
        dateUtc: '2026-11-15',
        usedToday: 3,
        lastSyncAt: new Date('2026-11-15T18:05:00.000Z'),
        lastSyncOutcome: 'updated',
      });

      const prismaMock = {
        match: { findMany: findManyMock },
        apiFootballQuotaState: { upsert: quotaUpsertMock },
      } as unknown as PrismaService;

      const repository = new PrismaMatchesRepository(prismaMock);
      const matches = await repository.findAll({ status: 'programado' });

      expect(matches).toHaveLength(1);
      expect(matches[0]?.markets[0]?.selections[0]?.odds).toBe(1.95);
      expect(matches[0]?.externalId).toBe(12345);

      const quota = await repository.saveQuotaState({
        dateUtc: '2026-11-15',
        usedToday: 3,
        lastSyncAt: '2026-11-15T18:05:00.000Z',
        lastSyncOutcome: 'updated',
      });
      expect(quota.usedToday).toBe(3);
      expect(quota.lastSyncOutcome).toBe('updated');
    });
  });
});
