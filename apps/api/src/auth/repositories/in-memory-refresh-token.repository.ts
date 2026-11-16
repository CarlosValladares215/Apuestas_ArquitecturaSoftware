import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
  RotateRefreshTokenInput,
} from './refresh-token.repository';

function cloneRefreshToken(record: RefreshTokenRecord): RefreshTokenRecord {
  return {
    ...record,
    expiresAt: new Date(record.expiresAt),
    revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
    createdAt: new Date(record.createdAt),
  };
}

@Injectable()
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tokensById = new Map<string, RefreshTokenRecord>();

  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
      revokedAt: null,
      replacedByTokenId: null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    };
    this.tokensById.set(record.id, record);
    return Promise.resolve(cloneRefreshToken(record));
  }

  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const record of this.tokensById.values()) {
      if (record.tokenHash === tokenHash) {
        return Promise.resolve(cloneRefreshToken(record));
      }
    }
    return Promise.resolve(null);
  }

  rotateToken(
    input: RotateRefreshTokenInput,
  ): Promise<{ rotated: boolean; nextRecord: RefreshTokenRecord | null }> {
    const current = this.tokensById.get(input.currentId);
    if (!current || current.revokedAt !== null) {
      return Promise.resolve({ rotated: false, nextRecord: null });
    }

    current.revokedAt = new Date(input.revokedAt);
    current.replacedByTokenId = input.nextId;

    const nextRecord: RefreshTokenRecord = {
      id: input.nextId,
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.nextTokenHash,
      expiresAt: new Date(input.nextExpiresAt),
      revokedAt: null,
      replacedByTokenId: null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    };
    this.tokensById.set(nextRecord.id, nextRecord);

    return Promise.resolve({ rotated: true, nextRecord: cloneRefreshToken(nextRecord) });
  }

  revokeById(id: string, revokedAt: Date): Promise<void> {
    const current = this.tokensById.get(id);
    if (current && current.revokedAt === null) {
      current.revokedAt = new Date(revokedAt);
    }
    return Promise.resolve();
  }

  revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    for (const record of this.tokensById.values()) {
      if (record.familyId === familyId && record.revokedAt === null) {
        record.revokedAt = new Date(revokedAt);
      }
    }
    return Promise.resolve();
  }
}
