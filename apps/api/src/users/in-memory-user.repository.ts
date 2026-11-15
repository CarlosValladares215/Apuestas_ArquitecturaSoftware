import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppRole, PaginatedResponse } from '@apuestas/shared';
import { CreateUserInput, UserRecord, UserRepository } from './user.repository';

function cloneUser(user: UserRecord): UserRecord {
  return {
    ...user,
    adultConfirmedAt: new Date(user.adultConfirmedAt),
    emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt) : null,
    lockedUntil: user.lockedUntil ? new Date(user.lockedUntil) : null,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<string, UserRecord>();

  findById(id: string): Promise<UserRecord | null> {
    const found = this.usersById.get(id);
    return Promise.resolve(found ? cloneUser(found) : null);
  }

  findByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    for (const user of this.usersById.values()) {
      if (user.email === normalizedEmail) {
        return Promise.resolve(cloneUser(user));
      }
    }
    return Promise.resolve(null);
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    for (const existing of this.usersById.values()) {
      if (existing.email === input.email) {
        throw new ConflictException('Email is already registered.');
      }
    }

    const now = new Date();
    const record: UserRecord = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      adultConfirmedAt: new Date(input.adultConfirmedAt),
      emailVerifiedAt: input.emailVerifiedAt ? new Date(input.emailVerifiedAt) : null,
      totpEnabled: false,
      totpSecretEncrypted: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    this.usersById.set(record.id, record);
    return Promise.resolve(cloneUser(record));
  }

  markEmailVerified(userId: string, verifiedAt: Date): Promise<UserRecord> {
    const existing = this.requireUser(userId);
    existing.emailVerifiedAt = existing.emailVerifiedAt ?? new Date(verifiedAt);
    existing.updatedAt = new Date();
    return Promise.resolve(cloneUser(existing));
  }

  recordFailedLogin(
    userId: string,
    nextAttempts: number,
    lockedUntil: Date | null,
  ): Promise<UserRecord> {
    const existing = this.requireUser(userId);
    existing.failedLoginAttempts = nextAttempts;
    existing.lockedUntil = lockedUntil ? new Date(lockedUntil) : null;
    existing.updatedAt = new Date();
    return Promise.resolve(cloneUser(existing));
  }

  resetLoginFailures(userId: string): Promise<UserRecord> {
    const existing = this.requireUser(userId);
    existing.failedLoginAttempts = 0;
    existing.lockedUntil = null;
    existing.updatedAt = new Date();
    return Promise.resolve(cloneUser(existing));
  }

  savePendingTotpSecret(userId: string, encryptedSecret: string): Promise<UserRecord> {
    const existing = this.requireUser(userId);
    existing.totpSecretEncrypted = encryptedSecret;
    existing.totpEnabled = false;
    existing.updatedAt = new Date();
    return Promise.resolve(cloneUser(existing));
  }

  enableTotp(userId: string): Promise<UserRecord> {
    const existing = this.requireUser(userId);
    existing.totpEnabled = true;
    existing.updatedAt = new Date();
    return Promise.resolve(cloneUser(existing));
  }

  updateRole(userId: string, role: AppRole): Promise<UserRecord> {
    const existing = this.requireUser(userId);
    existing.role = role;
    existing.updatedAt = new Date();
    return Promise.resolve(cloneUser(existing));
  }

  countAdmins(): Promise<number> {
    let count = 0;
    for (const user of this.usersById.values()) {
      if (user.role === 'admin') {
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  findPaginated(page: number, pageSize: number): Promise<PaginatedResponse<UserRecord>> {
    const all = Array.from(this.usersById.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const offset = (page - 1) * pageSize;
    return Promise.resolve({
      items: all.slice(offset, offset + pageSize).map(cloneUser),
      total: all.length,
      page,
      pageSize,
    });
  }

  private requireUser(userId: string): UserRecord {
    const found = this.usersById.get(userId);
    if (!found) {
      throw new NotFoundException('User not found.');
    }
    return found;
  }
}
