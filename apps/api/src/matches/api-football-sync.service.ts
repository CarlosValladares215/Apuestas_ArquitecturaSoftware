import {
  ApiFootballSyncMode,
  ApiFootballSyncOutcome,
  ApiFootballSyncStatus,
  AppRole,
  MatchStatus,
  SyncQuotaPurpose,
  calculateAdaptiveSyncIntervalMs,
  canConsumeApiFootballQuota,
} from '@apuestas/shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK_PORT, ServerClock } from './clock.provider';
import { MatchesService } from './matches.service';
import { InMemoryMatchesRepository } from './repositories/in-memory-matches.repository';
import {
  ExternalFixtureUpsertInput,
  MATCHES_REPOSITORY,
  MatchesRepository,
  QuotaStateRecord,
} from './repositories/matches.repository';

interface ApiFootballFixturePayload {
  fixture?: {
    id?: number;
    date?: string;
    status?: {
      short?: string;
      elapsed?: number | null;
    };
  };
  league?: {
    id?: number;
    name?: string;
    country?: string;
  };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
}

interface ApiFootballResponseBody {
  response?: ApiFootballFixturePayload[];
}

function mapApiFootballStatus(shortCode: string | undefined): MatchStatus {
  switch ((shortCode ?? '').toUpperCase()) {
    case '1H':
    case 'HT':
    case '2H':
    case 'ET':
    case 'BT':
    case 'P':
    case 'LIVE':
      return 'en_vivo';
    case 'FT':
    case 'AET':
    case 'PEN':
      return 'finalizado';
    case 'SUSP':
    case 'INT':
      return 'suspendido';
    case 'PST':
      return 'aplazado';
    case 'CANC':
    case 'ABD':
    case 'AWD':
    case 'WO':
      return 'cancelado';
    default:
      return 'programado';
  }
}

@Injectable()
export class ApiFootballSyncService {
  private readonly logger = new Logger(ApiFootballSyncService.name);
  private readonly dailyBudget: number;
  private readonly liveReserve: number;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly liveFetchEnabled: boolean;
  private readonly matchesRepository: MatchesRepository;

  constructor(
    private readonly matchesService: MatchesService,
    private readonly configService: ConfigService,
    @Inject(CLOCK_PORT) private readonly clock: ServerClock,
    @Optional()
    @Inject(MATCHES_REPOSITORY)
    matchesRepository?: MatchesRepository,
  ) {
    const rawBudget = Number(this.configService.get<string>('API_FOOTBALL_DAILY_BUDGET') ?? '100');
    const rawReserve = Number(this.configService.get<string>('API_FOOTBALL_LIVE_RESERVE') ?? '15');

    this.dailyBudget = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : 100;
    this.liveReserve = Number.isFinite(rawReserve) && rawReserve >= 0 ? rawReserve : 15;
    this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY')?.trim();
    this.baseUrl = (
      this.configService.get<string>('API_FOOTBALL_BASE_URL') ?? 'https://v3.football.api-sports.io'
    )
      .trim()
      .replace(/\/$/, '');

    const explicitLiveFetch = this.configService.get<string>('API_FOOTBALL_LIVE_FETCH');
    const hasRealKey = Boolean(
      this.apiKey &&
      this.apiKey !== 'replace_with_api_football_sandbox_key' &&
      !this.apiKey.startsWith('sandbox_'),
    );

    this.liveFetchEnabled =
      explicitLiveFetch === 'true' ||
      (explicitLiveFetch !== 'false' && hasRealKey && process.env.NODE_ENV !== 'test');

    this.matchesRepository = matchesRepository ?? new InMemoryMatchesRepository();
  }

  async getStatus(): Promise<ApiFootballSyncStatus> {
    const state = await this.loadCurrentDayQuotaState();
    const activeLiveMatches = (await this.matchesService.listMatches({ status: 'en_vivo' })).length;
    const remainingToday = Math.max(0, this.dailyBudget - state.usedToday);

    const recommendedIntervalMs = calculateAdaptiveSyncIntervalMs({
      activeLiveMatches,
      dailyBudget: this.dailyBudget,
      liveReserve: this.liveReserve,
      usedToday: state.usedToday,
    });

    const mode = this.resolveMode(activeLiveMatches, remainingToday);

    return {
      dateUtc: state.dateUtc,
      dailyBudget: this.dailyBudget,
      liveReserve: this.liveReserve,
      usedToday: state.usedToday,
      remainingToday,
      activeLiveMatches,
      mode,
      recommendedIntervalMs,
      apiKeyConfigured: Boolean(
        this.apiKey && this.apiKey !== 'replace_with_api_football_sandbox_key',
      ),
      lastSyncAt: state.lastSyncAt,
      lastSyncOutcome: state.lastSyncOutcome,
    };
  }

  async runSyncCycle(
    purpose: SyncQuotaPurpose = 'live',
    actorRole: AppRole = 'operator',
    actorUserId: string | null = null,
  ): Promise<ApiFootballSyncStatus> {
    const state = await this.loadCurrentDayQuotaState();

    const remainingBefore = Math.max(0, this.dailyBudget - state.usedToday);
    if (remainingBefore <= 0) {
      await this.matchesRepository.saveQuotaState({
        ...state,
        lastSyncOutcome: 'skipped_budget',
      });
      return this.getStatus();
    }

    const allowed = canConsumeApiFootballQuota(
      {
        dailyBudget: this.dailyBudget,
        liveReserve: this.liveReserve,
        usedToday: state.usedToday,
      },
      purpose,
    );

    if (!allowed) {
      await this.matchesRepository.saveQuotaState({
        ...state,
        lastSyncOutcome: 'skipped_reserve',
      });
      return this.getStatus();
    }

    let outcome: ApiFootballSyncOutcome = 'updated';
    if (this.liveFetchEnabled && this.apiKey) {
      const externalFixtures = await this.fetchFixturesFromApiFootball(purpose, state.dateUtc);
      if (externalFixtures.length > 0) {
        await this.matchesService.upsertExternalFixtures(externalFixtures, actorRole, actorUserId);
      } else {
        await this.matchesService.applyExternalSyncHeartbeat(actorRole, actorUserId);
      }
    } else {
      await this.matchesService.applyExternalSyncHeartbeat(actorRole, actorUserId);
      outcome = 'updated';
    }

    await this.matchesRepository.saveQuotaState({
      dateUtc: state.dateUtc,
      usedToday: state.usedToday + 1,
      lastSyncAt: this.clock.now().toISOString(),
      lastSyncOutcome: outcome,
    });

    return this.getStatus();
  }

  private async fetchFixturesFromApiFootball(
    purpose: SyncQuotaPurpose,
    dateUtc: string,
  ): Promise<ExternalFixtureUpsertInput[]> {
    const query = purpose === 'live' ? 'live=all' : `date=${dateUtc}`;
    const url = `${this.baseUrl}/fixtures?${query}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-apisports-key': this.apiKey ?? '',
        },
      });

      if (!response.ok) {
        this.logger.warn(`API-Football responded with HTTP ${String(response.status)}`);
        return [];
      }

      const payload = (await response.json()) as ApiFootballResponseBody;
      const items = Array.isArray(payload.response) ? payload.response : [];

      return items
        .filter((item) =>
          Boolean(item.fixture?.id && item.teams?.home?.name && item.teams.away?.name),
        )
        .slice(0, 20)
        .map((item) => ({
          externalId: item.fixture?.id ?? 0,
          competitionExternalId: item.league?.id,
          competitionName: item.league?.name ?? 'Competición Internacional',
          competitionCountry: item.league?.country ?? 'Internacional',
          homeTeam: item.teams?.home?.name ?? 'Local',
          awayTeam: item.teams?.away?.name ?? 'Visitante',
          kickoffAt: item.fixture?.date ?? this.clock.now().toISOString(),
          status: mapApiFootballStatus(item.fixture?.status?.short),
          homeScore: item.goals?.home ?? 0,
          awayScore: item.goals?.away ?? 0,
          elapsedMinute: item.fixture?.status?.elapsed ?? null,
        }));
    } catch (error) {
      this.logger.warn(`API-Football request failed: ${(error as Error).message}`);
      return [];
    }
  }

  private async loadCurrentDayQuotaState(): Promise<QuotaStateRecord> {
    const todayUtc = this.getServerUtcDateString();
    const state = await this.matchesRepository.getQuotaState(todayUtc);

    if (state.dateUtc !== todayUtc) {
      return this.matchesRepository.saveQuotaState({
        dateUtc: todayUtc,
        usedToday: 0,
        lastSyncAt: null,
        lastSyncOutcome: 'idle',
      });
    }

    return state;
  }

  private getServerUtcDateString(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  private resolveMode(activeLiveMatches: number, remainingToday: number): ApiFootballSyncMode {
    if (remainingToday <= 0) {
      return 'budget_exhausted';
    }
    if (activeLiveMatches > 0) {
      return 'live_active';
    }
    if (remainingToday <= this.liveReserve) {
      return 'reserve_protected';
    }
    return 'scheduled_only';
  }
}
