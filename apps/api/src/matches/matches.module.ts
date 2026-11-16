import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaStorageEnabled } from '../prisma/storage-mode';
import { ApiFootballSyncService } from './api-football-sync.service';
import { CLOCK_PORT, systemServerClock } from './clock.provider';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { InMemoryMatchesRepository } from './repositories/in-memory-matches.repository';
import { MATCHES_REPOSITORY } from './repositories/matches.repository';
import { PrismaMatchesRepository } from './repositories/prisma-matches.repository';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [MatchesController],
  providers: [
    InMemoryMatchesRepository,
    PrismaMatchesRepository,
    {
      provide: MATCHES_REPOSITORY,
      inject: [ConfigService, PrismaService, InMemoryMatchesRepository, PrismaMatchesRepository],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryMatchesRepository,
        prismaRepo: PrismaMatchesRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
    MatchesService,
    ApiFootballSyncService,
    {
      provide: CLOCK_PORT,
      useValue: systemServerClock,
    },
  ],
  exports: [MatchesService, ApiFootballSyncService, MATCHES_REPOSITORY],
})
export class MatchesModule {}
