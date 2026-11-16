import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK_PORT, ServerClock } from './clock.provider';
import { MatchesService } from './matches.service';

describe('MatchesService (005-partidos-mercados)', () => {
  let service: MatchesService;
  let currentServerTime: Date;

  const mockClock: ServerClock = {
    now: () => currentServerTime,
  };

  beforeEach(async () => {
    currentServerTime = new Date('2026-11-15T18:00:00.000Z');

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchesService,
        {
          provide: CLOCK_PORT,
          useValue: mockClock,
        },
      ],
    }).compile();

    service = moduleRef.get(MatchesService);
  });

  describe('match state machine transitions', () => {
    it('supports valid lifecycle transitions programado -> en_vivo -> finalizado and records audit logs', () => {
      const created = service.createMatch(
        {
          competitionId: 'comp_conmebol',
          competitionName: 'Eliminatorias CONMEBOL',
          country: 'Sudamérica',
          homeTeam: 'Ecuador',
          awayTeam: 'Colombia',
          kickoffAt: '2026-11-15T21:00:00.000Z',
        },
        'operator',
      );

      expect(created.status).toBe('programado');

      const live = service.transitionMatchStatus(
        created.id,
        { status: 'en_vivo', homeScore: 1, awayScore: 0, elapsedMinute: 24 },
        'operator',
      );
      expect(live.status).toBe('en_vivo');
      expect(live.score).toEqual({ home: 1, away: 0 });
      expect(live.elapsedMinute).toBe(24);

      const finished = service.transitionMatchStatus(
        created.id,
        { status: 'finalizado', homeScore: 2, awayScore: 0 },
        'operator',
      );
      expect(finished.status).toBe('finalizado');
      expect(finished.score).toEqual({ home: 2, away: 0 });
      expect(finished.elapsedMinute).toBeNull();

      const audits = service.getAuditLog();
      expect(audits.length).toBeGreaterThanOrEqual(3);
      expect(audits.map((a) => a.action)).toEqual(
        expect.arrayContaining(['MATCH_CREATED', 'MATCH_STATUS_CHANGED']),
      );
    });

    it('supports suspension and postponement transitions and rejects invalid transitions', () => {
      const created = service.createMatch(
        {
          competitionId: 'comp_ligapro',
          competitionName: 'LigaPro Serie A',
          country: 'Ecuador',
          homeTeam: 'Barcelona SC',
          awayTeam: 'Emelec',
          kickoffAt: '2026-11-15T22:00:00.000Z',
        },
        'operator',
      );

      // Invalid direct jump programado -> finalizado
      expect(() =>
        service.transitionMatchStatus(created.id, { status: 'finalizado' }, 'operator'),
      ).toThrow(BadRequestException);

      // Valid programado -> suspendido -> en_vivo -> finalizado
      const suspended = service.transitionMatchStatus(
        created.id,
        { status: 'suspendido' },
        'operator',
      );
      expect(suspended.status).toBe('suspendido');

      const resumed = service.transitionMatchStatus(
        created.id,
        { status: 'en_vivo', homeScore: 0, awayScore: 0, elapsedMinute: 46 },
        'operator',
      );
      expect(resumed.status).toBe('en_vivo');

      service.transitionMatchStatus(created.id, { status: 'finalizado' }, 'operator');

      // Terminal state finalizado cannot transition back to en_vivo or programado
      expect(() =>
        service.transitionMatchStatus(created.id, { status: 'en_vivo' }, 'operator'),
      ).toThrow(BadRequestException);
    });
  });

  describe('automatic closure of pre-match markets by server clock', () => {
    it('closes pre-match markets automatically as soon as server clock reaches kickoffAt', () => {
      const match = service.createMatch(
        {
          competitionId: 'comp_ucl',
          competitionName: 'UEFA Champions League',
          country: 'Europa',
          homeTeam: 'Real Madrid',
          awayTeam: 'Arsenal',
          kickoffAt: '2026-11-15T19:00:00.000Z',
        },
        'operator',
      );

      const market = service.createMarket(
        match.id,
        {
          type: 'match_winner_1x2',
          name: 'Resultado Final (1X2)',
          isPreMatch: true,
          selections: [
            { key: 'HOME', label: 'Real Madrid', odds: 1.95 },
            { key: 'DRAW', label: 'Empate', odds: 3.4 },
            { key: 'AWAY', label: 'Arsenal', odds: 3.8 },
          ],
        },
        'operator',
      );

      expect(market.status).toBe('open');

      // Advance server clock to exact kickoff time
      currentServerTime = new Date('2026-11-15T19:00:00.000Z');

      const fetchedAfterKickoff = service.getMatchById(match.id);
      const refreshedMarket = fetchedAfterKickoff.markets.find((m) => m.id === market.id);
      expect(refreshedMarket?.status).toBe('closed');
      expect(refreshedMarket?.closedReason).toBe('match_started');

      // Reject manual odds changes on pre-match market once server kickoff time has passed
      expect(() =>
        service.updateMarketOdds(
          match.id,
          market.id,
          { selections: [{ key: 'HOME', odds: 2.1 }] },
          'operator',
        ),
      ).toThrow(BadRequestException);
    });

    it('allows operator to update manual odds before kickoff and rejects invalid odds < 1.01', () => {
      const match = service.createMatch(
        {
          competitionId: 'comp_ligapro',
          competitionName: 'LigaPro Serie A',
          country: 'Ecuador',
          homeTeam: 'LDU Quito',
          awayTeam: 'Aucas',
          kickoffAt: '2026-11-15T23:00:00.000Z',
        },
        'admin',
      );

      const market = match.markets[0];
      expect(market).toBeDefined();
      if (!market) {
        throw new Error('Expected default 1X2 market');
      }

      const updated = service.updateMarketOdds(
        match.id,
        market.id,
        { selections: [{ key: 'HOME', odds: 1.75 }] },
        'admin',
      );

      const homeSelection = updated.selections.find((s) => s.key === 'HOME');
      expect(homeSelection?.odds).toBe(1.75);

      expect(() =>
        service.updateMarketOdds(
          match.id,
          market.id,
          { selections: [{ key: 'HOME', odds: 0.95 }] },
          'admin',
        ),
      ).toThrow(BadRequestException);
    });
  });
});
