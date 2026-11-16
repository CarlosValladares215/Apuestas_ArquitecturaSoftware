export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface CreateRefreshTokenInput {
  id?: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RotateRefreshTokenInput {
  currentId: string;
  revokedAt: Date;
  nextId: string;
  userId: string;
  familyId: string;
  nextTokenHash: string;
  nextExpiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  rotateToken(
    input: RotateRefreshTokenInput,
  ): Promise<{ rotated: boolean; nextRecord: RefreshTokenRecord | null }>;
  revokeById(id: string, revokedAt: Date): Promise<void>;
  revokeFamily(familyId: string, revokedAt: Date): Promise<void>;
}
