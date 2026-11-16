import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletController } from './wallet.controller';
import { WalletService } from './services/wallet.service';
import { LedgerService } from './services/ledger.service';
import { PayphoneService } from './services/payphone.service';
import { InMemoryLedgerRepository } from './repositories/in-memory-ledger.repository';
import { LEDGER_REPOSITORY } from './repositories/ledger.repository.interface';
import { WALLET_REPOSITORY } from './repositories/wallet.repository.interface';
import { PAYMENT_INTENT_REPOSITORY } from './repositories/payment-intent.repository.interface';
import { AUDIT_LOG_REPOSITORY } from './repositories/audit-log.repository.interface';

@Module({
  imports: [ConfigModule],
  controllers: [WalletController],
  providers: [
    InMemoryLedgerRepository,
    {
      provide: LEDGER_REPOSITORY,
      useExisting: InMemoryLedgerRepository,
    },
    {
      provide: WALLET_REPOSITORY,
      useExisting: InMemoryLedgerRepository,
    },
    {
      provide: PAYMENT_INTENT_REPOSITORY,
      useExisting: InMemoryLedgerRepository,
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
