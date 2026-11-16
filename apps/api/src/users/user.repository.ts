import { AppRole, AuthUserView, PaginatedResponse } from '@apuestas/shared';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: AppRole;
  adultConfirmedAt: Date;
  emailVerifiedAt: Date | null;
  totpEnabled: boolean;
  totpSecretEncrypted: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: AppRole;
  adultConfirmedAt: Date;
  emailVerifiedAt?: Date | null;
}

/**
 * Strips all sensitive credential fields before returning user profiles to callers.
 */
export function toAuthUserView(user: UserRecord): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    totpEnabled: user.totpEnabled,
    adultConfirmedAt: user.adultConfirmedAt.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(normalizedEmail: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  markEmailVerified(userId: string, verifiedAt: Date): Promise<UserRecord>;
  recordFailedLogin(
    userId: string,
    nextAttempts: number,
    lockedUntil: Date | null,
  ): Promise<UserRecord>;
  resetLoginFailures(userId: string): Promise<UserRecord>;
  savePendingTotpSecret(userId: string, encryptedSecret: string): Promise<UserRecord>;
  enableTotp(userId: string): Promise<UserRecord>;
  updateRole(userId: string, role: AppRole): Promise<UserRecord>;
  countAdmins(): Promise<number>;
  findPaginated(page: number, pageSize: number): Promise<PaginatedResponse<UserRecord>>;
}
