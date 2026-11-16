import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ApiFootballSyncService } from './api-football-sync.service';
import { CLOCK_PORT, ServerClock } from './clock.provider';
import { MatchesService } from './matches.service';
import { InMemoryMatchesRepository } from './repositories/in-memory-matches.repository';
import { MATCHES_REPOSITORY } from './repositories/matches.repository';

describe('ApiFootballSyncService (006-sincronizacion-api-football)', () => {
  let syncService: ApiFootballSyncService;
  let matchesService: MatchesService;
  let currentServerTime: Date;

  const mockClock: ServerClock = {
    now: () => currentServerTime,
  };

  beforeEach(async () => {
    currentServerTime = new Date('2026-11-15T18:00:00.000Z');

    const moduleRef = await Test.createTestingModule({
      providers: [
        InMemoryMatchesRepository,
        {
          provide: MATCHES_REPOSITORY,
          useExisting: InMemoryMatchesRepository,
        },
        MatchesService,
        ApiFootballSyncService,
        {
          provide: CLOCK_PORT,
          useValue: mockClock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'API_FOOTBALL_KEY') return 'sandbox_secret_api_football_key';
              if (key === 'API_FOOTBALL_DAILY_BUDGET') return '10';
              if (key === 'API_FOOTBALL_LIVE_RESERVE') return '2';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    syncService = moduleRef.get(ApiFootballSyncService);
    matchesService = moduleRef.get(MatchesService);
  });

  it('uses adaptive high frequency when live matches exist and never exposes API_FOOTBALL_KEY', async () => {
    const status = await syncService.getStatus();

    expect(status.dailyBudget).toBe(10);
    expect(status.liveReserve).toBe(2);
    expect(status.usedToday).toBe(0);
    expect(status.remainingToday).toBe(10);
    expect(status.activeLiveMatches).toBeGreaterThanOrEqual(1);
    expect(status.mode).toBe('live_active');
    expect(status.recommendedIntervalMs).toBe(60_000);
    expect(status.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(status)).not.toContain('sandbox_secret_api_football_key');
  });

  it('respects daily request budget, protects live reserve from scheduled syncs, and halts at zero remaining', async () => {
    for (let i = 0; i < 8; i++) {
      const res = await syncService.runSyncCycle('scheduled', 'operator');
      expect(res.lastSyncOutcome).toBe('updated');
    }

    const afterEight = await syncService.getStatus();
    expect(afterEight.usedToday).toBe(8);
    expect(afterEight.remainingToday).toBe(2);

    const skippedScheduled = await syncService.runSyncCycle('scheduled', 'operator');
    expect(skippedScheduled.lastSyncOutcome).toBe('skipped_reserve');
    expect(skippedScheduled.usedToday).toBe(8);

    const live1 = await syncService.runSyncCycle('live', 'operator');
    expect(live1.lastSyncOutcome).toBe('updated');
    expect(live1.usedToday).toBe(9);

    const live2 = await syncService.runSyncCycle('live', 'operator');
    expect(live2.lastSyncOutcome).toBe('updated');
    expect(live2.usedToday).toBe(10);
    expect(live2.remainingToday).toBe(0);
    expect(live2.mode).toBe('budget_exhausted');
    expect(live2.recommendedIntervalMs).toBeNull();

    const exhausted = await syncService.runSyncCycle('live', 'operator');
    expect(exhausted.lastSyncOutcome).toBe('skipped_budget');
    expect(exhausted.usedToday).toBe(10);
  });

  it('resets daily counter automatically when server UTC date advances to the next day', async () => {
    await syncService.runSyncCycle('live', 'operator');
    expect((await syncService.getStatus()).usedToday).toBe(1);

    currentServerTime = new Date('2026-11-16T00:05:00.000Z');
    const nextDayStatus = await syncService.getStatus();
    expect(nextDayStatus.dateUtc).toBe('2026-11-16');
    expect(nextDayStatus.usedToday).toBe(0);
    expect(nextDayStatus.remainingToday).toBe(10);
    expect((await matchesService.listMatches()).length).toBeGreaterThan(0);
  });

  it('fetches and persists real API-Football v3 fixtures when API_FOOTBALL_LIVE_FETCH is enabled', async () => {
    const repo = new InMemoryMatchesRepository();
    const localMatchesService = new MatchesService(mockClock, repo);
    const liveConfig = {
      get: (key: string) => {
        if (key === 'API_FOOTBALL_KEY') return 'real_api_sports_key_12345';
        if (key === 'API_FOOTBALL_LIVE_FETCH') return 'true';
        if (key === 'API_FOOTBALL_DAILY_BUDGET') return '100';
        if (key === 'API_FOOTBALL_LIVE_RESERVE') return '15';
        return undefined;
      },
    } as ConfigService;

    const liveSyncService = new ApiFootballSyncService(
      localMatchesService,
      liveConfig,
      mockClock,
      repo,
    );

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          response: [
            {
              fixture: {
                id: 987654,
                date: '2026-11-15T20:00:00.000Z',
                status: { short: '1H', elapsed: 37 },
              },
              league: { id: 242, name: 'LigaPro Serie A', country: 'Ecuador' },
              teams: { home: { name: 'Aucas' }, away: { name: 'Universidad Católica' } },
              goals: { home: 2, away: 1 },
            },
          ],
        }),
    }) as typeof fetch;

    try {
      const status = await liveSyncService.runSyncCycle('live', 'admin');
      expect(status.usedToday).toBe(1);

      const imported = await localMatchesService.getMatchById('match_ext_987654');
      expect(imported.homeTeam).toBe('Aucas');
      expect(imported.awayTeam).toBe('Universidad Católica');
      expect(imported.status).toBe('en_vivo');
      expect(imported.score).toEqual({ home: 2, away: 1 });
      expect(imported.elapsedMinute).toBe(37);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
