import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaStorageEnabled } from '../prisma/storage-mode';
import { AdminAuditController } from './admin-audit.controller';
import { AUDIT_LOG_REPOSITORY } from './audit-log.repository';
import { AuditService } from './audit.service';
import { InMemoryAuditLogRepository } from './in-memory-audit-log.repository';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository';

@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [
    InMemoryAuditLogRepository,
    PrismaAuditLogRepository,
    {
      provide: AUDIT_LOG_REPOSITORY,
      inject: [ConfigService, PrismaService, InMemoryAuditLogRepository, PrismaAuditLogRepository],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryAuditLogRepository,
        prismaRepo: PrismaAuditLogRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
