import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ApiFootballSyncOutcome,
  BettingMarket,
  MarketClosedReason,
  MarketStatus,
  MatchStatus,
  MatchWithMarkets,
} from '@apuestas/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ExternalFixtureUpsertInput,
  MatchesRepository,
  QuotaStateRecord,
} from './matches.repository';

type PrismaMatchWithRelations = Prisma.MatchGetPayload<{
  include: {
    competition: true;
    markets: {
      include: { selections: true };
    };
  };
}>;

function mapMarketRow(market: PrismaMatchWithRelations['markets'][number]): BettingMarket {
  return {
    id: market.id,
    matchId: market.matchId,
    type: market.type,
    name: market.name,
    isPreMatch: market.isPreMatch,
    status: market.status as MarketStatus,
    closedReason: (market.closedReason as MarketClosedReason | null) ?? null,
    selections: market.selections.map((sel) => ({
      id: sel.id,
      marketId: sel.marketId,
      key: sel.key,
      label: sel.label,
      odds: Number(sel.odds),
    })),
  };
}

function mapMatchRow(row: PrismaMatchWithRelations): MatchWithMarkets {
  return {
    id: row.id,
    competitionId: row.competitionId,
    competition: {
      id: row.competition.id,
      name: row.competition.name,
      country: row.competition.country,
      sport: row.competition.sport,
      ...(row.competition.externalId !== null ? { externalId: row.competition.externalId } : {}),
    },
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    kickoffAt: row.kickoffAt.toISOString(),
    status: row.status as MatchStatus,
    score: {
      home: row.homeScore,
      away: row.awayScore,
    },
    elapsedMinute: row.elapsedMinute,
    ...(row.externalId !== null ? { externalId: row.externalId } : {}),
    markets: row.markets.map(mapMarketRow),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaMatchesRepository implements MatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: {
    status?: MatchStatus;
    competitionId?: string;
  }): Promise<MatchWithMarkets[]> {
    const rows = await this.prisma.match.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.competitionId ? { competitionId: filters.competitionId } : {}),
      },
      include: {
        competition: true,
        markets: {
          orderBy: { createdAt: 'asc' },
          include: { selections: true },
        },
      },
      orderBy: { kickoffAt: 'asc' },
    });
    return rows.map(mapMatchRow);
  }

  async findById(matchId: string): Promise<MatchWithMarkets | null> {
    const row = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: true,
        markets: {
          orderBy: { createdAt: 'asc' },
          include: { selections: true },
        },
      },
    });
    return row ? mapMatchRow(row) : null;
  }

  async saveNewMatch(match: MatchWithMarkets): Promise<MatchWithMarkets> {
    await this.prisma.competition.upsert({
      where: { id: match.competition.id },
      update: {
        name: match.competition.name,
        country: match.competition.country,
      },
      create: {
        id: match.competition.id,
        name: match.competition.name,
        country: match.competition.country,
        sport: match.competition.sport,
        externalId: match.competition.externalId ?? null,
      },
    });

    const created = await this.prisma.match.create({
      data: {
        id: match.id,
        competitionId: match.competitionId,
        externalId: match.externalId ?? null,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoffAt: new Date(match.kickoffAt),
        status: match.status,
        homeScore: match.score.home,
        awayScore: match.score.away,
        elapsedMinute: match.elapsedMinute,
        markets: {
          create: match.markets.map((market) => ({
            id: market.id,
            type: market.type,
            name: market.name,
            isPreMatch: market.isPreMatch,
            status: market.status,
            closedReason: market.closedReason,
            selections: {
              create: market.selections.map((sel) => ({
                id: sel.id,
                key: sel.key,
                label: sel.label,
                odds: sel.odds,
              })),
            },
          })),
        },
      },
      include: {
        competition: true,
        markets: { include: { selections: true } },
      },
    });

    return mapMatchRow(created);
  }

  async saveUpdatedMatch(match: MatchWithMarkets): Promise<MatchWithMarkets> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: {
          status: match.status,
          homeScore: match.score.home,
          awayScore: match.score.away,
          elapsedMinute: match.elapsedMinute,
        },
      });

      for (const market of match.markets) {
        await tx.bettingMarket.update({
          where: { id: market.id },
          data: {
            status: market.status,
            closedReason: market.closedReason,
          },
        });
      }

      return tx.match.findUniqueOrThrow({
        where: { id: match.id },
        include: {
          competition: true,
          markets: { include: { selections: true } },
        },
      });
    });

    return mapMatchRow(updated);
  }

  async addMarketToMatch(matchId: string, market: BettingMarket): Promise<BettingMarket> {
    const created = await this.prisma.bettingMarket.create({
      data: {
        id: market.id,
        matchId,
        type: market.type,
        name: market.name,
        isPreMatch: market.isPreMatch,
        status: market.status,
        closedReason: market.closedReason,
        selections: {
          create: market.selections.map((sel) => ({
            id: sel.id,
            key: sel.key,
            label: sel.label,
            odds: sel.odds,
          })),
        },
      },
      include: { selections: true },
    });

    return {
      id: created.id,
      matchId: created.matchId,
      type: created.type,
      name: created.name,
      isPreMatch: created.isPreMatch,
      status: created.status as MarketStatus,
      closedReason: (created.closedReason as MarketClosedReason | null) ?? null,
      selections: created.selections.map((sel) => ({
        id: sel.id,
        marketId: sel.marketId,
        key: sel.key,
        label: sel.label,
        odds: Number(sel.odds),
      })),
    };
  }

  async saveUpdatedMarket(_matchId: string, market: BettingMarket): Promise<BettingMarket> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.bettingMarket.update({
        where: { id: market.id },
        data: {
          status: market.status,
          closedReason: market.closedReason,
        },
      });

      for (const sel of market.selections) {
        await tx.marketSelection.update({
          where: { id: sel.id },
          data: { odds: sel.odds },
        });
      }

      return tx.bettingMarket.findUniqueOrThrow({
        where: { id: market.id },
        include: { selections: true },
      });
    });

    return {
      id: updated.id,
      matchId: updated.matchId,
      type: updated.type,
      name: updated.name,
      isPreMatch: updated.isPreMatch,
      status: updated.status as MarketStatus,
      closedReason: (updated.closedReason as MarketClosedReason | null) ?? null,
      selections: updated.selections.map((sel) => ({
        id: sel.id,
        marketId: sel.marketId,
        key: sel.key,
        label: sel.label,
        odds: Number(sel.odds),
      })),
    };
  }

  async upsertExternalFixture(input: ExternalFixtureUpsertInput): Promise<MatchWithMarkets> {
    const existing = await this.prisma.match.findUnique({
      where: { externalId: input.externalId },
      include: {
        competition: true,
        markets: { include: { selections: true } },
      },
    });

    if (existing) {
      const updated = await this.prisma.match.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          elapsedMinute: input.elapsedMinute,
        },
        include: {
          competition: true,
          markets: { include: { selections: true } },
        },
      });
      return mapMatchRow(updated);
    }

    const compId = input.competitionExternalId
      ? `comp_ext_${String(input.competitionExternalId)}`
      : 'comp_external';
    const matchId = `match_ext_${String(input.externalId)}`;
    const marketId = `mkt_${matchId}_1x2`;

    return this.saveNewMatch({
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
      updatedAt: new Date().toISOString(),
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
            { id: `sel_${marketId}_home`, marketId, key: 'HOME', label: input.homeTeam, odds: 2.0 },
            { id: `sel_${marketId}_draw`, marketId, key: 'DRAW', label: 'Empate', odds: 3.2 },
            { id: `sel_${marketId}_away`, marketId, key: 'AWAY', label: input.awayTeam, odds: 3.5 },
          ],
        },
      ],
    });
  }

  async getQuotaState(defaultDateUtc: string): Promise<QuotaStateRecord> {
    const row = await this.prisma.apiFootballQuotaState.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        dateUtc: defaultDateUtc,
        usedToday: 0,
        lastSyncOutcome: 'idle',
      },
    });

    return {
      dateUtc: row.dateUtc,
      usedToday: row.usedToday,
      lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
      lastSyncOutcome: row.lastSyncOutcome as ApiFootballSyncOutcome,
    };
  }

  async saveQuotaState(state: QuotaStateRecord): Promise<QuotaStateRecord> {
    const row = await this.prisma.apiFootballQuotaState.upsert({
      where: { id: 'default' },
      update: {
        dateUtc: state.dateUtc,
        usedToday: state.usedToday,
        lastSyncAt: state.lastSyncAt ? new Date(state.lastSyncAt) : null,
        lastSyncOutcome: state.lastSyncOutcome,
      },
      create: {
        id: 'default',
        dateUtc: state.dateUtc,
        usedToday: state.usedToday,
        lastSyncAt: state.lastSyncAt ? new Date(state.lastSyncAt) : null,
        lastSyncOutcome: state.lastSyncOutcome,
      },
    });

    return {
      dateUtc: row.dateUtc,
      usedToday: row.usedToday,
      lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
      lastSyncOutcome: row.lastSyncOutcome as ApiFootballSyncOutcome,
    };
  }
}
