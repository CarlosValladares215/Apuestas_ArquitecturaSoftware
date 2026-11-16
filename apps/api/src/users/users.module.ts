import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaStorageEnabled } from '../prisma/storage-mode';
import { AdminUsersController } from './admin-users.controller';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { PrismaUserRepository } from './prisma-user.repository';
import { USER_REPOSITORY } from './user.repository';

@Module({
  controllers: [AdminUsersController],
  providers: [
    InMemoryUserRepository,
    PrismaUserRepository,
    {
      provide: USER_REPOSITORY,
      inject: [ConfigService, PrismaService, InMemoryUserRepository, PrismaUserRepository],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryUserRepository,
        prismaRepo: PrismaUserRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
