import {
  APP_ROLES,
  APP_VERSION,
  MATCH_STATUSES,
  calculateAdaptiveSyncIntervalMs,
  canConsumeApiFootballQuota,
  canTransitionMatchStatus,
  createHealthStatus,
  isPreMatchMarketOpen,
  isValidAppRole,
  shouldAutoClosePreMatchMarket,
} from '../src/index';

describe('shared contracts', () => {
  it('exposes the three constitutional platform roles', () => {
    expect(APP_ROLES).toEqual(['bettor', 'operator', 'admin']);
    expect(isValidAppRole('bettor')).toBe(true);
    expect(isValidAppRole('superadmin')).toBe(false);
  });

  it('creates a valid HealthStatus payload with ISO timestamp', () => {
    const fixedDate = new Date('2026-11-14T21:00:00.000Z');
    const payload = createHealthStatus('api', 'ok', fixedDate);

    expect(payload).toEqual({
      status: 'ok',
      service: 'api',
      version: APP_VERSION,
      timestamp: '2026-11-14T21:00:00.000Z',
    });
  });

  describe('match state machine (005-partidos-mercados)', () => {
    it('exposes all six constitutional match statuses', () => {
      expect(MATCH_STATUSES).toEqual([
        'programado',
        'en_vivo',
        'finalizado',
        'suspendido',
        'aplazado',
        'cancelado',
      ]);
    });

    it('allows valid match state transitions', () => {
      expect(canTransitionMatchStatus('programado', 'en_vivo')).toBe(true);
      expect(canTransitionMatchStatus('programado', 'suspendido')).toBe(true);
      expect(canTransitionMatchStatus('programado', 'aplazado')).toBe(true);
      expect(canTransitionMatchStatus('programado', 'cancelado')).toBe(true);
      expect(canTransitionMatchStatus('en_vivo', 'finalizado')).toBe(true);
      expect(canTransitionMatchStatus('en_vivo', 'suspendido')).toBe(true);
      expect(canTransitionMatchStatus('suspendido', 'en_vivo')).toBe(true);
      expect(canTransitionMatchStatus('suspendido', 'cancelado')).toBe(true);
      expect(canTransitionMatchStatus('aplazado', 'programado')).toBe(true);
      expect(canTransitionMatchStatus('aplazado', 'en_vivo')).toBe(true);
    });

    it('rejects invalid or terminal match state transitions', () => {
      expect(canTransitionMatchStatus('programado', 'finalizado')).toBe(false);
      expect(canTransitionMatchStatus('en_vivo', 'programado')).toBe(false);
      expect(canTransitionMatchStatus('finalizado', 'en_vivo')).toBe(false);
      expect(canTransitionMatchStatus('finalizado', 'programado')).toBe(false);
      expect(canTransitionMatchStatus('cancelado', 'programado')).toBe(false);
      expect(canTransitionMatchStatus('cancelado', 'en_vivo')).toBe(false);
    });
  });

  describe('pre-match market auto-close by server clock (005-partidos-mercados)', () => {
    const kickoffAt = '2026-11-15T20:00:00.000Z';

    it('keeps pre-match market open before kickoff when match is programado', () => {
      const beforeKickoff = new Date('2026-11-15T19:59:59.000Z');
      expect(
        shouldAutoClosePreMatchMarket(
          { status: 'programado', kickoffAt },
          { isPreMatch: true, status: 'open' },
          beforeKickoff,
        ),
      ).toBe(false);
      expect(
        isPreMatchMarketOpen(
          { status: 'programado', kickoffAt },
          { isPreMatch: true, status: 'open' },
          beforeKickoff,
        ),
      ).toBe(true);
    });

    it('auto-closes pre-match market at or after server kickoff time or when match is no longer programado', () => {
      const exactKickoff = new Date('2026-11-15T20:00:00.000Z');
      const afterKickoff = new Date('2026-11-15T20:05:00.000Z');
      const beforeKickoff = new Date('2026-11-15T19:30:00.000Z');

      expect(
        shouldAutoClosePreMatchMarket(
          { status: 'programado', kickoffAt },
          { isPreMatch: true, status: 'open' },
          exactKickoff,
        ),
      ).toBe(true);

      expect(
        isPreMatchMarketOpen(
          { status: 'programado', kickoffAt },
          { isPreMatch: true, status: 'open' },
          afterKickoff,
        ),
      ).toBe(false);

      expect(
        shouldAutoClosePreMatchMarket(
          { status: 'en_vivo', kickoffAt },
          { isPreMatch: true, status: 'open' },
          beforeKickoff,
        ),
      ).toBe(true);
    });
  });

  describe('API-Football daily budget and adaptive sync frequency (006-sincronizacion-api-football)', () => {
    it('selects high frequency (60s) when live matches are active and quota is available', () => {
      const interval = calculateAdaptiveSyncIntervalMs({
        activeLiveMatches: 2,
        dailyBudget: 100,
        liveReserve: 15,
        usedToday: 40,
      });

      expect(interval).toBe(60_000);
      expect(
        canConsumeApiFootballQuota({ dailyBudget: 100, liveReserve: 15, usedToday: 40 }, 'live'),
      ).toBe(true);
    });

    it('selects spaced frequency (30m) when only scheduled matches exist and reserve is safe', () => {
      const interval = calculateAdaptiveSyncIntervalMs({
        activeLiveMatches: 0,
        dailyBudget: 100,
        liveReserve: 15,
        usedToday: 40,
      });

      expect(interval).toBe(1_800_000);
    });

    it('protects live reserve from non-live scheduled syncs and halts when daily budget is exhausted', () => {
      expect(
        canConsumeApiFootballQuota(
          { dailyBudget: 100, liveReserve: 15, usedToday: 85 },
          'scheduled',
        ),
      ).toBe(false);

      expect(
        canConsumeApiFootballQuota({ dailyBudget: 100, liveReserve: 15, usedToday: 85 }, 'live'),
      ).toBe(true);

      expect(
        canConsumeApiFootballQuota({ dailyBudget: 100, liveReserve: 15, usedToday: 100 }, 'live'),
      ).toBe(false);

      expect(
        calculateAdaptiveSyncIntervalMs({
          activeLiveMatches: 1,
          dailyBudget: 100,
          liveReserve: 15,
          usedToday: 100,
        }),
      ).toBeNull();
    });
  });
});
