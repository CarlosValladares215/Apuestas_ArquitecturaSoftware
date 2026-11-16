export const APP_VERSION = '0.1.0';

export const APP_ROLES = ['bettor', 'operator', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type ServiceName = 'api' | 'reports' | 'web';

export type HealthState = 'ok' | 'degraded';

export interface HealthStatus {
  status: HealthState;
  service: ServiceName;
  version: string;
  timestamp: string;
}

export const MATCH_STATUSES = [
  'programado',
  'en_vivo',
  'finalizado',
  'suspendido',
  'aplazado',
  'cancelado',
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MARKET_STATUSES = ['open', 'closed', 'suspended'] as const;

export type MarketStatus = (typeof MARKET_STATUSES)[number];

export type MarketClosedReason = 'match_started' | 'match_status_changed' | 'manual_operator';

export interface Competition {
  id: string;
  name: string;
  country: string;
  sport: string;
  externalId?: number;
}

export interface MatchScore {
  home: number;
  away: number;
}

export interface MarketSelection {
  id: string;
  marketId: string;
  key: string;
  label: string;
  odds: number;
}

export interface BettingMarket {
  id: string;
  matchId: string;
  type: string;
  name: string;
  isPreMatch: boolean;
  status: MarketStatus;
  closedReason: MarketClosedReason | null;
  selections: MarketSelection[];
}

export interface MatchWithMarkets {
  id: string;
  competitionId: string;
  competition: Competition;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  status: MatchStatus;
  score: MatchScore;
  elapsedMinute: number | null;
  externalId?: number;
  markets: BettingMarket[];
  updatedAt: string;
}

export type SyncQuotaPurpose = 'live' | 'scheduled';

export type ApiFootballSyncMode =
  'live_active' | 'scheduled_only' | 'reserve_protected' | 'budget_exhausted';

export type ApiFootballSyncOutcome = 'updated' | 'skipped_budget' | 'skipped_reserve' | 'idle';

export interface ApiFootballSyncStatus {
  dateUtc: string;
  dailyBudget: number;
  liveReserve: number;
  usedToday: number;
  remainingToday: number;
  activeLiveMatches: number;
  mode: ApiFootballSyncMode;
  recommendedIntervalMs: number | null;
  apiKeyConfigured: boolean;
  lastSyncAt: string | null;
  lastSyncOutcome: ApiFootballSyncOutcome;
}

export interface MatchAuditEntry {
  id: string;
  timestamp: string;
  actorRole: AppRole;
  action:
    | 'MATCH_CREATED'
    | 'MATCH_STATUS_CHANGED'
    | 'MARKET_CREATED'
    | 'ODDS_UPDATED'
    | 'API_FOOTBALL_SYNC';
  matchId: string;
  details: string;
}

export const MATCH_STATE_TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  programado: ['en_vivo', 'suspendido', 'aplazado', 'cancelado'],
  en_vivo: ['finalizado', 'suspendido', 'aplazado', 'cancelado'],
  suspendido: ['en_vivo', 'aplazado', 'cancelado'],
  aplazado: ['programado', 'en_vivo', 'cancelado'],
  finalizado: [],
  cancelado: [],
};

export const LIVE_SYNC_INTERVAL_MS = 60_000;
export const SCHEDULED_SYNC_INTERVAL_MS = 1_800_000;
export const RESERVE_PROTECTED_SYNC_INTERVAL_MS = 21_600_000;

/**
 * Checks whether a value corresponds to a recognized platform role.
 */
export function isValidAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Checks whether a value is a recognized match status.
 */
export function isValidMatchStatus(value: string): value is MatchStatus {
  return (MATCH_STATUSES as readonly string[]).includes(value);
}

/**
 * Validates whether a match status transition is permitted by the domain state machine.
 */
export function canTransitionMatchStatus(from: MatchStatus, to: MatchStatus): boolean {
  return MATCH_STATE_TRANSITIONS[from].includes(to);
}

/**
 * Determines whether a pre-match market must be automatically closed based on the server clock
 * or current match status.
 */
export function shouldAutoClosePreMatchMarket(
  match: Pick<MatchWithMarkets, 'status' | 'kickoffAt'>,
  market: Pick<BettingMarket, 'isPreMatch' | 'status'>,
  serverNow: Date,
): boolean {
  if (!market.isPreMatch) {
    return false;
  }

  if (match.status !== 'programado') {
    return true;
  }

  const kickoffMs = Date.parse(match.kickoffAt);
  return serverNow.getTime() >= kickoffMs;
}

/**
 * Evaluates whether a market is effectively open for pre-match betting according to the server clock.
 */
export function isPreMatchMarketOpen(
  match: Pick<MatchWithMarkets, 'status' | 'kickoffAt'>,
  market: Pick<BettingMarket, 'isPreMatch' | 'status'>,
  serverNow: Date,
): boolean {
  if (market.status !== 'open') {
    return false;
  }

  if (shouldAutoClosePreMatchMarket(match, market, serverNow)) {
    return false;
  }

  return true;
}

/**
 * Checks whether the API-Football worker can consume a request from the daily budget
 * while respecting the reserved quota for live matches.
 */
export function canConsumeApiFootballQuota(
  quota: { dailyBudget: number; liveReserve: number; usedToday: number },
  purpose: SyncQuotaPurpose,
): boolean {
  const remaining = Math.max(0, quota.dailyBudget - quota.usedToday);
  if (remaining <= 0) {
    return false;
  }

  if (purpose === 'live') {
    return true;
  }

  return remaining > quota.liveReserve;
}

/**
 * Calculates the adaptive polling interval in milliseconds for API-Football synchronization.
 * Returns null if the daily budget is exhausted.
 */
export function calculateAdaptiveSyncIntervalMs(params: {
  activeLiveMatches: number;
  dailyBudget: number;
  liveReserve: number;
  usedToday: number;
}): number | null {
  const remaining = Math.max(0, params.dailyBudget - params.usedToday);
  if (remaining <= 0) {
    return null;
  }

  if (params.activeLiveMatches > 0) {
    return LIVE_SYNC_INTERVAL_MS;
  }

  if (remaining <= params.liveReserve) {
    return RESERVE_PROTECTED_SYNC_INTERVAL_MS;
  }

  return SCHEDULED_SYNC_INTERVAL_MS;
}

/**
 * Builds a standardized health payload shared across services.
 */
export function createHealthStatus(
  service: ServiceName,
  status: HealthState = 'ok',
  now: Date = new Date(),
): HealthStatus {
  return {
    status,
    service,
    version: APP_VERSION,
    timestamp: now.toISOString(),
  };
}
