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
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiFootballSyncService } from './api-football-sync.service';
import {
  CreateMarketDto,
  CreateMatchDto,
  RunSyncDto,
  UpdateMarketOddsDto,
  UpdateMatchStatusDto,
} from './dto/matches.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly syncService: ApiFootballSyncService,
  ) {}

  @Public()
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

  @Public()
  @Get('sync/status')
  getSyncStatus(): ApiFootballSyncStatus {
    return this.syncService.getStatus();
  }

  @Post('sync/run')
  @HttpCode(200)
  @Roles('operator', 'admin')
  runSync(@Body() dto: RunSyncDto, @CurrentUser() user: AuthenticatedUser): ApiFootballSyncStatus {
    return this.syncService.runSyncCycle(dto.purpose ?? 'live', user.role, user.userId);
  }

  @Public()
  @Get(':id')
  getMatchById(@Param('id') id: string): MatchWithMarkets {
    return this.matchesService.getMatchById(id);
  }

  @Post()
  @Roles('operator', 'admin')
  createMatch(
    @Body() dto: CreateMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): MatchWithMarkets {
    return this.matchesService.createMatch(dto, user.role, user.userId);
  }

  @Patch(':id/status')
  @Roles('operator', 'admin')
  updateMatchStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMatchStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): MatchWithMarkets {
    return this.matchesService.transitionMatchStatus(id, dto, user.role, user.userId);
  }

  @Post(':id/markets')
  @Roles('operator', 'admin')
  createMarket(
    @Param('id') id: string,
    @Body() dto: CreateMarketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): BettingMarket {
    return this.matchesService.createMarket(id, dto, user.role, user.userId);
  }

  @Patch(':id/markets/:marketId/odds')
  @Roles('operator', 'admin')
  updateMarketOdds(
    @Param('id') id: string,
    @Param('marketId') marketId: string,
    @Body() dto: UpdateMarketOddsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): BettingMarket {
    return this.matchesService.updateMarketOdds(id, marketId, dto, user.role, user.userId);
  }
}
