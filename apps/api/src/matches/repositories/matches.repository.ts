import {
  ApiFootballSyncOutcome,
  BettingMarket,
  MatchStatus,
  MatchWithMarkets,
} from '@apuestas/shared';

export const MATCHES_REPOSITORY = Symbol('MATCHES_REPOSITORY');

export interface QuotaStateRecord {
  dateUtc: string;
  usedToday: number;
  lastSyncAt: string | null;
  lastSyncOutcome: ApiFootballSyncOutcome;
}

export interface ExternalFixtureUpsertInput {
  externalId: number;
  competitionExternalId?: number;
  competitionName: string;
  competitionCountry: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  elapsedMinute: number | null;
}

export interface MatchesRepository {
  findAll(filters?: { status?: MatchStatus; competitionId?: string }): Promise<MatchWithMarkets[]>;
  findById(matchId: string): Promise<MatchWithMarkets | null>;
  saveNewMatch(match: MatchWithMarkets): Promise<MatchWithMarkets>;
  saveUpdatedMatch(match: MatchWithMarkets): Promise<MatchWithMarkets>;
  addMarketToMatch(
    matchId: string,
    market: BettingMarket,
    updatedAt: string,
  ): Promise<BettingMarket>;
  saveUpdatedMarket(
    matchId: string,
    market: BettingMarket,
    updatedAt: string,
  ): Promise<BettingMarket>;
  upsertExternalFixture(
    input: ExternalFixtureUpsertInput,
    nowIso: string,
  ): Promise<MatchWithMarkets>;
  getQuotaState(defaultDateUtc: string): Promise<QuotaStateRecord>;
  saveQuotaState(state: QuotaStateRecord): Promise<QuotaStateRecord>;
}
