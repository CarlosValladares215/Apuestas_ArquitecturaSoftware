import {
  ApiFootballSyncStatus,
  BettingMarket,
  MatchStatus,
  MatchWithMarkets,
  isValidMatchStatus,
} from '@apuestas/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiFootballSyncService } from './api-football-sync.service';
import {
  CreateMarketDto,
  CreateMatchDto,
  RunSyncDto,
  UpdateMarketOddsDto,
  UpdateMatchStatusDto,
} from './dto/matches.dto';
import { OperatorRoleGuard, RequestWithActorRole } from './guards/operator-role.guard';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly syncService: ApiFootballSyncService,
  ) {}

  @Get()
  listMatches(
    @Query('status') status?: string,
    @Query('competitionId') competitionId?: string,
  ): MatchWithMarkets[] {
    let validatedStatus: MatchStatus | undefined;
    if (status !== undefined) {
      if (!isValidMatchStatus(status)) {
        throw new BadRequestException(`Filtro de estado inválido: ${status}`);
      }
      validatedStatus = status;
    }

    return this.matchesService.listMatches({
      status: validatedStatus,
      competitionId,
    });
  }

  @Get('sync/status')
  getSyncStatus(): ApiFootballSyncStatus {
    return this.syncService.getStatus();
  }

  @Post('sync/run')
  @HttpCode(200)
  @UseGuards(OperatorRoleGuard)
  runSync(@Body() dto: RunSyncDto, @Req() req: RequestWithActorRole): ApiFootballSyncStatus {
    return this.syncService.runSyncCycle(dto.purpose ?? 'live', req.actorRole ?? 'operator');
  }

  @Get(':id')
  getMatchById(@Param('id') id: string): MatchWithMarkets {
    return this.matchesService.getMatchById(id);
  }

  @Post()
  @UseGuards(OperatorRoleGuard)
  createMatch(@Body() dto: CreateMatchDto, @Req() req: RequestWithActorRole): MatchWithMarkets {
    return this.matchesService.createMatch(dto, req.actorRole ?? 'operator');
  }

  @Patch(':id/status')
  @UseGuards(OperatorRoleGuard)
  updateMatchStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMatchStatusDto,
    @Req() req: RequestWithActorRole,
  ): MatchWithMarkets {
    return this.matchesService.transitionMatchStatus(id, dto, req.actorRole ?? 'operator');
  }

  @Post(':id/markets')
  @UseGuards(OperatorRoleGuard)
  createMarket(
    @Param('id') id: string,
    @Body() dto: CreateMarketDto,
    @Req() req: RequestWithActorRole,
  ): BettingMarket {
    return this.matchesService.createMarket(id, dto, req.actorRole ?? 'operator');
  }

  @Patch(':id/markets/:marketId/odds')
  @UseGuards(OperatorRoleGuard)
  updateMarketOdds(
    @Param('id') id: string,
    @Param('marketId') marketId: string,
    @Body() dto: UpdateMarketOddsDto,
    @Req() req: RequestWithActorRole,
  ): BettingMarket {
    return this.matchesService.updateMarketOdds(id, marketId, dto, req.actorRole ?? 'operator');
  }
}
