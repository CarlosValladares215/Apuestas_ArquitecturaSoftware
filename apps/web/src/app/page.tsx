import { APP_ROLES, APP_VERSION, ApiFootballSyncStatus, MatchWithMarkets } from '@apuestas/shared';
import { Matchboard } from '../components/matchboard';

const INITIAL_MATCHES: readonly MatchWithMarkets[] = [
  {
    id: 'match_ligapro_01',
    competitionId: 'comp_ligapro',
    competition: {
      id: 'comp_ligapro',
      name: 'LigaPro Serie A',
      country: 'Ecuador',
      sport: 'football',
    },
    homeTeam: 'LDU Quito',
    awayTeam: 'Independiente del Valle',
    kickoffAt: '2026-11-15T17:30:00.000Z',
    status: 'en_vivo',
    score: { home: 1, away: 1 },
    elapsedMinute: 62,
    updatedAt: '2026-11-15T18:15:00.000Z',
    markets: [
      {
        id: 'mkt_ligapro_01_1x2',
        matchId: 'match_ligapro_01',
        type: 'match_winner_1x2',
        name: 'Resultado Final (1X2)',
        isPreMatch: true,
        status: 'closed',
        closedReason: 'match_started',
        selections: [
          {
            id: 'sel_lp01_home',
            marketId: 'mkt_ligapro_01_1x2',
            key: 'HOME',
            label: 'LDU Quito',
            odds: 2.15,
          },
          {
            id: 'sel_lp01_draw',
            marketId: 'mkt_ligapro_01_1x2',
            key: 'DRAW',
            label: 'Empate',
            odds: 3.25,
          },
          {
            id: 'sel_lp01_away',
            marketId: 'mkt_ligapro_01_1x2',
            key: 'AWAY',
            label: 'Independiente del Valle',
            odds: 3.1,
          },
        ],
      },
      {
        id: 'mkt_ligapro_01_live_next',
        matchId: 'match_ligapro_01',
        type: 'next_goal_live',
        name: 'Próximo Gol (En Vivo)',
        isPreMatch: false,
        status: 'open',
        closedReason: null,
        selections: [
          {
            id: 'sel_lp01_ng_home',
            marketId: 'mkt_ligapro_01_live_next',
            key: 'HOME',
            label: 'LDU Quito',
            odds: 1.95,
          },
          {
            id: 'sel_lp01_ng_none',
            marketId: 'mkt_ligapro_01_live_next',
            key: 'NONE',
            label: 'Sin más goles',
            odds: 3.4,
          },
          {
            id: 'sel_lp01_ng_away',
            marketId: 'mkt_ligapro_01_live_next',
            key: 'AWAY',
            label: 'Independiente del Valle',
            odds: 2.2,
          },
        ],
      },
    ],
  },
  {
    id: 'match_conmebol_02',
    competitionId: 'comp_conmebol',
    competition: {
      id: 'comp_conmebol',
      name: 'Eliminatorias CONMEBOL',
      country: 'Sudamérica',
      sport: 'football',
    },
    homeTeam: 'Ecuador',
    awayTeam: 'Argentina',
    kickoffAt: '2027-03-25T21:00:00.000Z',
    status: 'programado',
    score: { home: 0, away: 0 },
    elapsedMinute: null,
    updatedAt: '2026-11-15T18:00:00.000Z',
    markets: [
      {
        id: 'mkt_conmebol_02_1x2',
        matchId: 'match_conmebol_02',
        type: 'match_winner_1x2',
        name: 'Resultado Final (1X2)',
        isPreMatch: true,
        status: 'open',
        closedReason: null,
        selections: [
          {
            id: 'sel_cm02_home',
            marketId: 'mkt_conmebol_02_1x2',
            key: 'HOME',
            label: 'Ecuador',
            odds: 2.85,
          },
          {
            id: 'sel_cm02_draw',
            marketId: 'mkt_conmebol_02_1x2',
            key: 'DRAW',
            label: 'Empate',
            odds: 3.1,
          },
          {
            id: 'sel_cm02_away',
            marketId: 'mkt_conmebol_02_1x2',
            key: 'AWAY',
            label: 'Argentina',
            odds: 2.45,
          },
        ],
      },
      {
        id: 'mkt_conmebol_02_ou25',
        matchId: 'match_conmebol_02',
        type: 'over_under_2_5',
        name: 'Total de Goles (Más/Menos 2.5)',
        isPreMatch: true,
        status: 'open',
        closedReason: null,
        selections: [
          {
            id: 'sel_cm02_over',
            marketId: 'mkt_conmebol_02_ou25',
            key: 'OVER_2_5',
            label: 'Más de 2.5 goles',
            odds: 2.1,
          },
          {
            id: 'sel_cm02_under',
            marketId: 'mkt_conmebol_02_ou25',
            key: 'UNDER_2_5',
            label: 'Menos de 2.5 goles',
            odds: 1.72,
          },
        ],
      },
    ],
  },
  {
    id: 'match_ucl_03',
    competitionId: 'comp_ucl',
    competition: {
      id: 'comp_ucl',
      name: 'UEFA Champions League',
      country: 'Europa',
      sport: 'football',
    },
    homeTeam: 'FC Barcelona',
    awayTeam: 'Bayern München',
    kickoffAt: '2026-11-15T15:00:00.000Z',
    status: 'suspendido',
    score: { home: 2, away: 1 },
    elapsedMinute: 71,
    updatedAt: '2026-11-15T16:30:00.000Z',
    markets: [
      {
        id: 'mkt_ucl_03_1x2',
        matchId: 'match_ucl_03',
        type: 'match_winner_1x2',
        name: 'Resultado Final (1X2)',
        isPreMatch: true,
        status: 'closed',
        closedReason: 'match_status_changed',
        selections: [
          {
            id: 'sel_ucl03_home',
            marketId: 'mkt_ucl_03_1x2',
            key: 'HOME',
            label: 'FC Barcelona',
            odds: 2.3,
          },
          {
            id: 'sel_ucl03_draw',
            marketId: 'mkt_ucl_03_1x2',
            key: 'DRAW',
            label: 'Empate',
            odds: 3.5,
          },
          {
            id: 'sel_ucl03_away',
            marketId: 'mkt_ucl_03_1x2',
            key: 'AWAY',
            label: 'Bayern München',
            odds: 2.75,
          },
        ],
      },
    ],
  },
];

const INITIAL_SYNC_STATUS: ApiFootballSyncStatus = {
  dateUtc: '2026-11-15',
  dailyBudget: 100,
  liveReserve: 15,
  usedToday: 12,
  remainingToday: 88,
  activeLiveMatches: 1,
  mode: 'live_active',
  recommendedIntervalMs: 60_000,
  apiKeyConfigured: true,
  lastSyncAt: '2026-11-15T18:15:00.000Z',
  lastSyncOutcome: 'updated',
};

export default function HomePage() {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Apuestas Deportivas UTPL</span>
          <span className="version-tag">
            Base v{APP_VERSION} · Roles: {APP_ROLES.join(', ')}
          </span>
        </div>
      </header>

      <main className="main-container">
        <section aria-labelledby="hero-title" className="hero-section">
          <h1 id="hero-title" className="hero-title">
            Cartelera deportiva y mercados en tiempo real
          </h1>
          <p className="hero-copy">
            Esta interfaz opera en modo de solo presentación: el cierre pre-partido se evalúa con el
            reloj del servidor y la sincronización con API-Football corre exclusivamente en el
            backend sin exponer credenciales en el navegador.
          </p>
        </section>

        <Matchboard initialMatches={INITIAL_MATCHES} syncStatus={INITIAL_SYNC_STATUS} />
      </main>
    </div>
  );
}
