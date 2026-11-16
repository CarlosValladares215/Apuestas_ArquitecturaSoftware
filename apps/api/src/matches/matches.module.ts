import { Module } from '@nestjs/common';
import { ApiFootballSyncService } from './api-football-sync.service';
import { CLOCK_PORT, systemServerClock } from './clock.provider';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  controllers: [MatchesController],
  providers: [
    MatchesService,
    ApiFootballSyncService,
    {
      provide: CLOCK_PORT,
      useValue: systemServerClock,
    },
  ],
  exports: [MatchesService, ApiFootballSyncService],
})
export class MatchesModule {}
