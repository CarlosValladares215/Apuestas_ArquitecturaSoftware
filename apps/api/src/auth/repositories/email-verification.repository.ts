export const EMAIL_VERIFICATION_REPOSITORY = Symbol('EMAIL_VERIFICATION_REPOSITORY');

export interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface EmailVerificationRepository {
  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerificationTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null>;
  consumeIfUnused(id: string, consumedAt: Date): Promise<boolean>;
}
