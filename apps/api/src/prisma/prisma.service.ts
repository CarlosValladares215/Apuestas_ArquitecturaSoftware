import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { isPrismaStorageEnabled } from './storage-mode';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private connected = false;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (isPrismaStorageEnabled(this.config)) {
      await this.$connect();
      this.connected = true;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.$disconnect();
      this.connected = false;
    }
  }
}
