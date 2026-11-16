import { Injectable } from '@nestjs/common';
import { BettingMarket, MatchStatus, MatchWithMarkets } from '@apuestas/shared';
import { createInitialMatchesSeed } from '../matches.seed';
import {
  ExternalFixtureUpsertInput,
  MatchesRepository,
  QuotaStateRecord,
} from './matches.repository';

function cloneMatch(match: MatchWithMarkets): MatchWithMarkets {
  return structuredClone(match);
}

@Injectable()
export class InMemoryMatchesRepository implements MatchesRepository {
  private readonly matches: MatchWithMarkets[] = createInitialMatchesSeed();
  private quotaState: QuotaStateRecord | null = null;

  findAll(filters?: { status?: MatchStatus; competitionId?: string }): Promise<MatchWithMarkets[]> {
    const filtered = this.matches
      .filter((match) => {
        if (filters?.status && match.status !== filters.status) {
          return false;
        }
        if (filters?.competitionId && match.competitionId !== filters.competitionId) {
          return false;
        }
        return true;
      })
      .map(cloneMatch);

    return Promise.resolve(filtered);
  }

  findById(matchId: string): Promise<MatchWithMarkets | null> {
    const found = this.matches.find((item) => item.id === matchId);
    return Promise.resolve(found ? cloneMatch(found) : null);
  }

  saveNewMatch(match: MatchWithMarkets): Promise<MatchWithMarkets> {
    const copy = cloneMatch(match);
    this.matches.unshift(copy);
    return Promise.resolve(cloneMatch(copy));
  }

  saveUpdatedMatch(match: MatchWithMarkets): Promise<MatchWithMarkets> {
    const index = this.matches.findIndex((item) => item.id === match.id);
    const copy = cloneMatch(match);
    if (index >= 0) {
      this.matches[index] = copy;
    } else {
      this.matches.unshift(copy);
    }
    return Promise.resolve(cloneMatch(copy));
  }

  addMarketToMatch(
    matchId: string,
    market: BettingMarket,
    updatedAt: string,
  ): Promise<BettingMarket> {
    const match = this.matches.find((item) => item.id === matchId);
    if (match) {
      match.markets.push(structuredClone(market));
      match.updatedAt = updatedAt;
    }
    return Promise.resolve(structuredClone(market));
  }

  saveUpdatedMarket(
    matchId: string,
    market: BettingMarket,
    updatedAt: string,
  ): Promise<BettingMarket> {
    const match = this.matches.find((item) => item.id === matchId);
    if (match) {
      const idx = match.markets.findIndex((m) => m.id === market.id);
      if (idx >= 0) {
        match.markets[idx] = structuredClone(market);
      }
      match.updatedAt = updatedAt;
    }
    return Promise.resolve(structuredClone(market));
  }

  upsertExternalFixture(
    input: ExternalFixtureUpsertInput,
    nowIso: string,
  ): Promise<MatchWithMarkets> {
    const existing = this.matches.find((item) => item.externalId === input.externalId);
    if (existing) {
      existing.status = input.status;
      existing.score = { home: input.homeScore, away: input.awayScore };
      existing.elapsedMinute = input.elapsedMinute;
      existing.updatedAt = nowIso;
      return Promise.resolve(cloneMatch(existing));
    }

    const compId = input.competitionExternalId
      ? `comp_ext_${String(input.competitionExternalId)}`
      : 'comp_external';
    const matchId = `match_ext_${String(input.externalId)}`;
    const marketId = `mkt_${matchId}_1x2`;

    const created: MatchWithMarkets = {
      id: matchId,
      competitionId: compId,
      competition: {
        id: compId,
        name: input.competitionName,
        country: input.competitionCountry,
        sport: 'football',
        externalId: input.competitionExternalId,
      },
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      kickoffAt: input.kickoffAt,
      status: input.status,
      score: { home: input.homeScore, away: input.awayScore },
      elapsedMinute: input.elapsedMinute,
      externalId: input.externalId,
      updatedAt: nowIso,
      markets: [
        {
          id: marketId,
          matchId,
          type: 'match_winner_1x2',
          name: 'Resultado Final (1X2)',
          isPreMatch: true,
          status: input.status === 'programado' ? 'open' : 'closed',
          closedReason: input.status === 'programado' ? null : 'match_status_changed',
          selections: [
            {
              id: `sel_${marketId}_home`,
              marketId,
              key: 'HOME',
              label: input.homeTeam,
              odds: 2.0,
            },
            {
              id: `sel_${marketId}_draw`,
              marketId,
              key: 'DRAW',
              label: 'Empate',
              odds: 3.2,
            },
            {
              id: `sel_${marketId}_away`,
              marketId,
              key: 'AWAY',
              label: input.awayTeam,
              odds: 3.5,
            },
          ],
        },
      ],
    };

    this.matches.unshift(created);
    return Promise.resolve(cloneMatch(created));
  }

  getQuotaState(defaultDateUtc: string): Promise<QuotaStateRecord> {
    if (!this.quotaState) {
      this.quotaState = {
        dateUtc: defaultDateUtc,
        usedToday: 0,
        lastSyncAt: null,
        lastSyncOutcome: 'idle',
      };
    }
    return Promise.resolve({ ...this.quotaState });
  }

  saveQuotaState(state: QuotaStateRecord): Promise<QuotaStateRecord> {
    this.quotaState = { ...state };
    return Promise.resolve({ ...this.quotaState });
  }
}
