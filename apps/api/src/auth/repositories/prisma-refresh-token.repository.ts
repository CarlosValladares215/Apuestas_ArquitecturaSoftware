import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
  RotateRefreshTokenInput,
} from './refresh-token.repository';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    return this.prisma.refreshToken.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async rotateToken(
    input: RotateRefreshTokenInput,
  ): Promise<{ rotated: boolean; nextRecord: RefreshTokenRecord | null }> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.refreshToken.updateMany({
        where: {
          id: input.currentId,
          revokedAt: null,
        },
        data: {
          revokedAt: input.revokedAt,
          replacedByTokenId: input.nextId,
        },
      });

      if (updated.count !== 1) {
        return { rotated: false, nextRecord: null };
      }

      const nextRecord = await tx.refreshToken.create({
        data: {
          id: input.nextId,
          userId: input.userId,
          familyId: input.familyId,
          tokenHash: input.nextTokenHash,
          expiresAt: input.nextExpiresAt,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });

      return { rotated: true, nextRecord };
    });
  }

  async revokeById(id: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
