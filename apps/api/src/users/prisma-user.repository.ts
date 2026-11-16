import { Injectable } from '@nestjs/common';
import { Role as PrismaRole, User as PrismaUser } from '@prisma/client';
import { AppRole, PaginatedResponse } from '@apuestas/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserInput, UserRecord, UserRepository } from './user.repository';

function mapPrismaUser(row: PrismaUser): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    adultConfirmedAt: row.adultConfirmedAt,
    emailVerifiedAt: row.emailVerifiedAt,
    totpEnabled: row.totpEnabled,
    totpSecretEncrypted: row.totpSecretEncrypted,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserRecord | null> {
    const found = await this.prisma.user.findUnique({ where: { id } });
    return found ? mapPrismaUser(found) : null;
  }

  async findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    const found = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    return found ? mapPrismaUser(found) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        adultConfirmedAt: input.adultConfirmedAt,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
      },
    });
    return mapPrismaUser(created);
  }

  async markEmailVerified(userId: string, verifiedAt: Date): Promise<UserRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: verifiedAt },
    });
    return mapPrismaUser(updated);
  }

  async recordFailedLogin(
    userId: string,
    nextAttempts: number,
    lockedUntil: Date | null,
  ): Promise<UserRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: nextAttempts,
        lockedUntil,
      },
    });
    return mapPrismaUser(updated);
  }

  async resetLoginFailures(userId: string): Promise<UserRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    return mapPrismaUser(updated);
  }

  async savePendingTotpSecret(userId: string, encryptedSecret: string): Promise<UserRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecretEncrypted: encryptedSecret,
        totpEnabled: false,
      },
    });
    return mapPrismaUser(updated);
  }

  async enableTotp(userId: string): Promise<UserRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
    return mapPrismaUser(updated);
  }

  async updateRole(userId: string, role: AppRole): Promise<UserRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
    return mapPrismaUser(updated);
  }

  async countAdmins(): Promise<number> {
    return this.prisma.user.count({ where: { role: PrismaRole.admin } });
  }

  async findPaginated(page: number, pageSize: number): Promise<PaginatedResponse<UserRecord>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);

    return {
      items: rows.map(mapPrismaUser),
      total,
      page,
      pageSize,
    };
  }
}
