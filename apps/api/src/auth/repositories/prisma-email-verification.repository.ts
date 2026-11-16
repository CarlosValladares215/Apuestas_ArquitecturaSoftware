import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EmailVerificationRepository,
  EmailVerificationTokenRecord,
} from './email-verification.repository';

@Injectable()
export class PrismaEmailVerificationRepository implements EmailVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerificationTokenRecord> {
    return this.prisma.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  findByTokenHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null> {
    return this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  }

  async consumeIfUnused(id: string, consumedAt: Date): Promise<boolean> {
    const result = await this.prisma.emailVerificationToken.updateMany({
      where: {
        id,
        consumedAt: null,
      },
      data: { consumedAt },
    });

    return result.count === 1;
  }
}
