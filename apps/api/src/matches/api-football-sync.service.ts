import {
  ApiFootballSyncMode,
  ApiFootballSyncOutcome,
  ApiFootballSyncStatus,
  AppRole,
  SyncQuotaPurpose,
  calculateAdaptiveSyncIntervalMs,
  canConsumeApiFootballQuota,
} from '@apuestas/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK_PORT, ServerClock } from './clock.provider';
import { MatchesService } from './matches.service';

@Injectable()
export class ApiFootballSyncService {
  private readonly dailyBudget: number;
  private readonly liveReserve: number;
  private readonly apiKey: string | undefined;

  private currentDateUtc: string;
  private usedToday = 0;
  private lastSyncAt: string | null = null;
  private lastSyncOutcome: ApiFootballSyncOutcome = 'idle';

  constructor(
    private readonly matchesService: MatchesService,
    private readonly configService: ConfigService,
    @Inject(CLOCK_PORT) private readonly clock: ServerClock,
  ) {
    const rawBudget = Number(this.configService.get<string>('API_FOOTBALL_DAILY_BUDGET') ?? '100');
    const rawReserve = Number(this.configService.get<string>('API_FOOTBALL_LIVE_RESERVE') ?? '15');

    this.dailyBudget = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : 100;
    this.liveReserve = Number.isFinite(rawReserve) && rawReserve >= 0 ? rawReserve : 15;
    this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY');
    this.currentDateUtc = this.getServerUtcDateString();
  }

  getStatus(): ApiFootballSyncStatus {
    this.ensureUtcDayRollover();

    const activeLiveMatches = this.matchesService.listMatches({ status: 'en_vivo' }).length;
    const remainingToday = Math.max(0, this.dailyBudget - this.usedToday);

    const recommendedIntervalMs = calculateAdaptiveSyncIntervalMs({
      activeLiveMatches,
      dailyBudget: this.dailyBudget,
      liveReserve: this.liveReserve,
      usedToday: this.usedToday,
    });

    const mode = this.resolveMode(activeLiveMatches, remainingToday);

    return {
      dateUtc: this.currentDateUtc,
      dailyBudget: this.dailyBudget,
      liveReserve: this.liveReserve,
      usedToday: this.usedToday,
      remainingToday,
      activeLiveMatches,
      mode,
      recommendedIntervalMs,
      apiKeyConfigured: Boolean(
        this.apiKey && this.apiKey !== 'replace_with_api_football_sandbox_key',
      ),
      lastSyncAt: this.lastSyncAt,
      lastSyncOutcome: this.lastSyncOutcome,
    };
  }

  runSyncCycle(
    purpose: SyncQuotaPurpose = 'live',
    actorRole: AppRole = 'operator',
    actorUserId: string | null = null,
  ): ApiFootballSyncStatus {
    this.ensureUtcDayRollover();

    const remainingBefore = Math.max(0, this.dailyBudget - this.usedToday);
    if (remainingBefore <= 0) {
      this.lastSyncOutcome = 'skipped_budget';
      return this.getStatus();
    }

    const allowed = canConsumeApiFootballQuota(
      {
        dailyBudget: this.dailyBudget,
        liveReserve: this.liveReserve,
        usedToday: this.usedToday,
      },
      purpose,
    );

    if (!allowed) {
      this.lastSyncOutcome = 'skipped_reserve';
      return this.getStatus();
    }

    this.usedToday += 1;
    this.lastSyncAt = this.clock.now().toISOString();
    this.lastSyncOutcome = 'updated';
    this.matchesService.applyExternalSyncHeartbeat(actorRole, actorUserId);

    return this.getStatus();
  }

  private ensureUtcDayRollover(): void {
    const todayUtc = this.getServerUtcDateString();
    if (todayUtc !== this.currentDateUtc) {
      this.currentDateUtc = todayUtc;
      this.usedToday = 0;
      this.lastSyncOutcome = 'idle';
    }
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
