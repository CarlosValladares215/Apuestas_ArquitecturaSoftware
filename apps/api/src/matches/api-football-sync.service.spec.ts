import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ApiFootballSyncService } from './api-football-sync.service';
import { CLOCK_PORT, ServerClock } from './clock.provider';
import { MatchesService } from './matches.service';

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

  it('uses adaptive high frequency when live matches exist and never exposes API_FOOTBALL_KEY', () => {
    const status = syncService.getStatus();

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

  it('respects daily request budget, protects live reserve from scheduled syncs, and halts at zero remaining', () => {
    // Consume 8 requests out of 10 (leaving 2, which equals liveReserve = 2)
    for (let i = 0; i < 8; i++) {
      const res = syncService.runSyncCycle('scheduled', 'operator');
      expect(res.lastSyncOutcome).toBe('updated');
    }

    const afterEight = syncService.getStatus();
    expect(afterEight.usedToday).toBe(8);
    expect(afterEight.remainingToday).toBe(2);

    // Scheduled sync must now be skipped to protect the live reserve (2 left <= 2 reserve)
    const skippedScheduled = syncService.runSyncCycle('scheduled', 'operator');
    expect(skippedScheduled.lastSyncOutcome).toBe('skipped_reserve');
    expect(skippedScheduled.usedToday).toBe(8);

    // Live sync CAN consume the reserved 2 requests
    const live1 = syncService.runSyncCycle('live', 'operator');
    expect(live1.lastSyncOutcome).toBe('updated');
    expect(live1.usedToday).toBe(9);

    const live2 = syncService.runSyncCycle('live', 'operator');
    expect(live2.lastSyncOutcome).toBe('updated');
    expect(live2.usedToday).toBe(10);
    expect(live2.remainingToday).toBe(0);
    expect(live2.mode).toBe('budget_exhausted');
    expect(live2.recommendedIntervalMs).toBeNull();

    // Once dailyBudget is reached (10/10), even live sync is blocked without throwing
    const exhausted = syncService.runSyncCycle('live', 'operator');
    expect(exhausted.lastSyncOutcome).toBe('skipped_budget');
    expect(exhausted.usedToday).toBe(10);
  });

  it('resets daily counter automatically when server UTC date advances to the next day', () => {
    syncService.runSyncCycle('live', 'operator');
    expect(syncService.getStatus().usedToday).toBe(1);

    // Next UTC day
    currentServerTime = new Date('2026-11-16T00:05:00.000Z');
    const nextDayStatus = syncService.getStatus();
    expect(nextDayStatus.dateUtc).toBe('2026-11-16');
    expect(nextDayStatus.usedToday).toBe(0);
    expect(nextDayStatus.remainingToday).toBe(10);
    expect(matchesService.listMatches().length).toBeGreaterThan(0);
  });
});
