import {
  AppRole,
  BettingMarket,
  MatchAuditEntry,
  MatchStatus,
  MatchWithMarkets,
  canTransitionMatchStatus,
  isPreMatchMarketOpen,
  shouldAutoClosePreMatchMarket,
} from '@apuestas/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CLOCK_PORT, ServerClock } from './clock.provider';
import {
  CreateMarketDto,
  CreateMatchDto,
  UpdateMarketOddsDto,
  UpdateMatchStatusDto,
} from './dto/matches.dto';
import { createInitialMatchesSeed } from './matches.seed';

@Injectable()
export class MatchesService {
  private readonly matches: MatchWithMarkets[] = createInitialMatchesSeed();
  private readonly auditLog: MatchAuditEntry[] = [];
  private sequence = 100;

  constructor(
    @Inject(CLOCK_PORT) private readonly clock: ServerClock,
    @Optional() private readonly globalAuditService?: AuditService,
  ) {}

  listMatches(filters?: { status?: MatchStatus; competitionId?: string }): MatchWithMarkets[] {
    const evaluated = this.matches.map((match) => this.evaluateMatchMarketsWithClock(match));

    return evaluated.filter((match) => {
      if (filters?.status && match.status !== filters.status) {
        return false;
      }
      if (filters?.competitionId && match.competitionId !== filters.competitionId) {
        return false;
      }
      return true;
    });
  }

  getMatchById(matchId: string): MatchWithMarkets {
    const match = this.matches.find((item) => item.id === matchId);
    if (!match) {
      throw new NotFoundException(`Partido ${matchId} no encontrado.`);
    }

    return this.evaluateMatchMarketsWithClock(match);
  }

  createMatch(
    dto: CreateMatchDto,
    actorRole: AppRole,
    actorUserId: string | null = null,
  ): MatchWithMarkets {
    if (dto.homeTeam.trim().toLowerCase() === dto.awayTeam.trim().toLowerCase()) {
      throw new BadRequestException('El equipo local y visitante deben ser distintos.');
    }

    const nowIso = this.clock.now().toISOString();
    const matchId = `match_${String(++this.sequence)}`;
    const marketId = `mkt_${String(++this.sequence)}_1x2`;

    const match: MatchWithMarkets = {
      id: matchId,
      competitionId: dto.competitionId,
      competition: {
        id: dto.competitionId,
        name: dto.competitionName,
        country: dto.country,
        sport: 'football',
      },
      homeTeam: dto.homeTeam.trim(),
      awayTeam: dto.awayTeam.trim(),
      kickoffAt: dto.kickoffAt,
      status: 'programado',
      score: { home: 0, away: 0 },
      elapsedMinute: null,
      updatedAt: nowIso,
      markets: [
        {
          id: marketId,
          matchId,
          type: 'match_winner_1x2',
          name: 'Resultado Final (1X2)',
          isPreMatch: true,
          status: 'open',
          closedReason: null,
          selections: [
            {
              id: `sel_${String(++this.sequence)}_home`,
              marketId,
              key: 'HOME',
              label: dto.homeTeam.trim(),
              odds: 2.0,
            },
            {
              id: `sel_${String(++this.sequence)}_draw`,
              marketId,
              key: 'DRAW',
              label: 'Empate',
              odds: 3.2,
            },
            {
              id: `sel_${String(++this.sequence)}_away`,
              marketId,
              key: 'AWAY',
              label: dto.awayTeam.trim(),
              odds: 3.5,
            },
          ],
        },
      ],
    };

    this.matches.unshift(match);
    this.appendAudit(
      actorRole,
      'MATCH_CREATED',
      match.id,
      `Creado ${match.homeTeam} vs ${match.awayTeam} (${match.kickoffAt})`,
      actorUserId,
    );

    return this.evaluateMatchMarketsWithClock(match);
  }

  transitionMatchStatus(
    matchId: string,
    dto: UpdateMatchStatusDto,
    actorRole: AppRole,
    actorUserId: string | null = null,
  ): MatchWithMarkets {
    const match = this.findMutableMatchOrThrow(matchId);
    const previousStatus = match.status;

    if (!canTransitionMatchStatus(previousStatus, dto.status)) {
      throw new BadRequestException(
        `Transición de estado inválida: no se permite pasar de '${previousStatus}' a '${dto.status}'.`,
      );
    }

    match.status = dto.status;
    if (dto.homeScore !== undefined) {
      match.score.home = dto.homeScore;
    }
    if (dto.awayScore !== undefined) {
      match.score.away = dto.awayScore;
    }

    if (dto.status === 'en_vivo') {
      match.elapsedMinute = dto.elapsedMinute ?? match.elapsedMinute ?? 1;
    } else if (
      dto.status === 'finalizado' ||
      dto.status === 'cancelado' ||
      dto.status === 'programado'
    ) {
      match.elapsedMinute = null;
    } else if (dto.elapsedMinute !== undefined) {
      match.elapsedMinute = dto.elapsedMinute;
    }

    match.updatedAt = this.clock.now().toISOString();

    if (dto.status !== 'programado') {
      for (const market of match.markets) {
        if (market.isPreMatch && market.status === 'open') {
          market.status = 'closed';
          market.closedReason = dto.status === 'en_vivo' ? 'match_started' : 'match_status_changed';
        } else if (
          !market.isPreMatch &&
          (dto.status === 'suspendido' ||
            dto.status === 'aplazado' ||
            dto.status === 'cancelado' ||
            dto.status === 'finalizado')
        ) {
          market.status = 'closed';
          market.closedReason = 'match_status_changed';
        }
      }
    }

    this.appendAudit(
      actorRole,
      'MATCH_STATUS_CHANGED',
      match.id,
      `Estado ${previousStatus} -> ${dto.status} (${String(match.score.home)}-${String(match.score.away)})`,
      actorUserId,
    );

    return this.evaluateMatchMarketsWithClock(match);
  }

  createMarket(
    matchId: string,
    dto: CreateMarketDto,
    actorRole: AppRole,
    actorUserId: string | null = null,
  ): BettingMarket {
    const match = this.findMutableMatchOrThrow(matchId);
    const serverNow = this.clock.now();

    if (
      dto.isPreMatch &&
      shouldAutoClosePreMatchMarket(match, { isPreMatch: true, status: 'open' }, serverNow)
    ) {
      throw new BadRequestException(
        'No se puede crear un mercado pre-partido abierto después de la hora de inicio del servidor o si el partido no está programado.',
      );
    }

    for (const sel of dto.selections) {
      if (!Number.isFinite(sel.odds) || sel.odds < 1.01) {
        throw new BadRequestException('Todas las cuotas deben ser mayores o iguales a 1.01.');
      }
    }

    const marketId = `mkt_${String(++this.sequence)}`;
    const market: BettingMarket = {
      id: marketId,
      matchId: match.id,
      type: dto.type.trim(),
      name: dto.name.trim(),
      isPreMatch: dto.isPreMatch,
      status: 'open',
      closedReason: null,
      selections: dto.selections.map((sel) => ({
        id: `sel_${String(++this.sequence)}`,
        marketId,
        key: sel.key.trim(),
        label: sel.label.trim(),
        odds: Number(sel.odds.toFixed(4)),
      })),
    };

    match.markets.push(market);
    match.updatedAt = serverNow.toISOString();

    this.appendAudit(
      actorRole,
      'MARKET_CREATED',
      match.id,
      `Mercado '${market.name}' (${market.type}) creado`,
      actorUserId,
    );

    return market;
  }

  updateMarketOdds(
    matchId: string,
    marketId: string,
    dto: UpdateMarketOddsDto,
    actorRole: AppRole,
    actorUserId: string | null = null,
  ): BettingMarket {
    const match = this.findMutableMatchOrThrow(matchId);
    this.evaluateMatchMarketsWithClock(match);

    const market = match.markets.find((item) => item.id === marketId);
    if (!market) {
      throw new NotFoundException(`Mercado ${marketId} no encontrado en el partido ${matchId}.`);
    }

    const serverNow = this.clock.now();
    if (market.isPreMatch && !isPreMatchMarketOpen(match, market, serverNow)) {
      throw new BadRequestException(
        'El mercado pre-partido está cerrado por inicio del partido según el reloj del servidor y no admite cambios.',
      );
    }

    if (market.status !== 'open') {
      throw new BadRequestException('El mercado no está abierto para actualización de cuotas.');
    }

    const changes: string[] = [];

    for (const update of dto.selections) {
      if (!Number.isFinite(update.odds) || update.odds < 1.01) {
        throw new BadRequestException('La cuota debe ser mayor o igual a 1.01.');
      }

      const target = market.selections.find((sel) => sel.key === update.key);
      if (!target) {
        throw new BadRequestException(
          `La selección '${update.key}' no existe en el mercado ${marketId}.`,
        );
      }

      const prevOdds = target.odds;
      target.odds = Number(update.odds.toFixed(4));
      changes.push(`${target.key}:${String(prevOdds)}->${String(target.odds)}`);
    }

    match.updatedAt = serverNow.toISOString();
    this.appendAudit(
      actorRole,
      'ODDS_UPDATED',
      match.id,
      `Cuotas actualizadas en ${market.id} (${changes.join(', ')})`,
      actorUserId,
    );

    return market;
  }

  applyExternalSyncHeartbeat(actorRole: AppRole, actorUserId: string | null = null): number {
    const nowIso = this.clock.now().toISOString();
    let touched = 0;

    for (const match of this.matches) {
      this.evaluateMatchMarketsWithClock(match);
      if (match.status === 'en_vivo') {
        match.elapsedMinute = Math.min(90, (match.elapsedMinute ?? 1) + 1);
        match.updatedAt = nowIso;
        touched += 1;
      }
    }

    this.appendAudit(
      actorRole,
      'API_FOOTBALL_SYNC',
      'global',
      `Sincronización API-Football aplicada (${String(touched)} partidos en vivo actualizados)`,
      actorUserId,
    );

    return touched;
  }

  getAuditLog(): readonly MatchAuditEntry[] {
    return this.auditLog;
  }

  private findMutableMatchOrThrow(matchId: string): MatchWithMarkets {
    const match = this.matches.find((item) => item.id === matchId);
    if (!match) {
      throw new NotFoundException(`Partido ${matchId} no encontrado.`);
    }
    return match;
  }

  private evaluateMatchMarketsWithClock(match: MatchWithMarkets): MatchWithMarkets {
    const serverNow = this.clock.now();

    for (const market of match.markets) {
      if (market.status === 'open' && shouldAutoClosePreMatchMarket(match, market, serverNow)) {
        market.status = 'closed';
        market.closedReason =
          match.status === 'programado' ? 'match_started' : 'match_status_changed';
      }
    }

    return match;
  }

  private appendAudit(
    actorRole: AppRole,
    action: MatchAuditEntry['action'],
    matchId: string,
    details: string,
    actorUserId: string | null = null,
  ): void {
    this.auditLog.push({
      id: `aud_${String(++this.sequence)}`,
      timestamp: this.clock.now().toISOString(),
      actorRole,
      action,
      matchId,
      details,
    });

    void this.globalAuditService?.record({
      actorUserId,
      action,
      targetType: 'Match',
      targetId: matchId,
      metadata: {
        actorRole,
        details,
      },
    });
  }
}
