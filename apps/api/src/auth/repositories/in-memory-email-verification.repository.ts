import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EmailVerificationRepository,
  EmailVerificationTokenRecord,
} from './email-verification.repository';

function cloneToken(record: EmailVerificationTokenRecord): EmailVerificationTokenRecord {
  return {
    ...record,
    expiresAt: new Date(record.expiresAt),
    consumedAt: record.consumedAt ? new Date(record.consumedAt) : null,
    createdAt: new Date(record.createdAt),
  };
}

@Injectable()
export class InMemoryEmailVerificationRepository implements EmailVerificationRepository {
  private readonly tokensById = new Map<string, EmailVerificationTokenRecord>();

  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerificationTokenRecord> {
    const record: EmailVerificationTokenRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
      consumedAt: null,
      createdAt: new Date(),
    };
    this.tokensById.set(record.id, record);
    return Promise.resolve(cloneToken(record));
  }

  findByTokenHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null> {
    for (const record of this.tokensById.values()) {
      if (record.tokenHash === tokenHash) {
        return Promise.resolve(cloneToken(record));
      }
    }
    return Promise.resolve(null);
  }

  consumeIfUnused(id: string, consumedAt: Date): Promise<boolean> {
    const existing = this.tokensById.get(id);
    if (!existing || existing.consumedAt !== null) {
      return Promise.resolve(false);
    }
    existing.consumedAt = new Date(consumedAt);
    return Promise.resolve(true);
  }
}
