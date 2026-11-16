import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaStorageEnabled } from '../prisma/storage-mode';
import { AUDIT_LOG_REPOSITORY } from './repositories/audit-log.repository.interface';
import { InMemoryLedgerRepository } from './repositories/in-memory-ledger.repository';
import { LEDGER_REPOSITORY } from './repositories/ledger.repository.interface';
import { PAYMENT_INTENT_REPOSITORY } from './repositories/payment-intent.repository.interface';
import { PrismaWalletLedgerRepository } from './repositories/prisma-ledger.repository';
import { WALLET_REPOSITORY } from './repositories/wallet.repository.interface';
import { LedgerService } from './services/ledger.service';
import { PayphoneService } from './services/payphone.service';
import { WalletService } from './services/wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [WalletController],
  providers: [
    InMemoryLedgerRepository,
    PrismaWalletLedgerRepository,
    {
      provide: LEDGER_REPOSITORY,
      inject: [
        ConfigService,
        PrismaService,
        InMemoryLedgerRepository,
        PrismaWalletLedgerRepository,
      ],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryLedgerRepository,
        prismaRepo: PrismaWalletLedgerRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
    {
      provide: WALLET_REPOSITORY,
      inject: [
        ConfigService,
        PrismaService,
        InMemoryLedgerRepository,
        PrismaWalletLedgerRepository,
      ],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryLedgerRepository,
        prismaRepo: PrismaWalletLedgerRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
    {
      provide: PAYMENT_INTENT_REPOSITORY,
      inject: [
        ConfigService,
        PrismaService,
        InMemoryLedgerRepository,
        PrismaWalletLedgerRepository,
      ],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryLedgerRepository,
        prismaRepo: PrismaWalletLedgerRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
    {
      provide: AUDIT_LOG_REPOSITORY,
      useExisting: InMemoryLedgerRepository,
    },
    LedgerService,
    PayphoneService,
    WalletService,
  ],
  exports: [
    WalletService,
    LedgerService,
    LEDGER_REPOSITORY,
    WALLET_REPOSITORY,
    PAYMENT_INTENT_REPOSITORY,
    AUDIT_LOG_REPOSITORY,
  ],
})
export class WalletModule {}
