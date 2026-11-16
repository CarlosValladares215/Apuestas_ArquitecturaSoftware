import { ConfigService } from '@nestjs/config';

const TEST_JWT_ACCESS_FALLBACK = 'test-only-jwt-access-secret-min-32-chars-spec-002';
const TEST_JWT_REFRESH_FALLBACK = 'test-only-jwt-refresh-secret-min-32-chars-spec-002';
const PLACEHOLDER_SECRET = 'replace_with_min_32_char_random_secret';

export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function resolveJwtAccessSecret(config?: ConfigService): string {
  const configured = (
    config?.get<string>('JWT_ACCESS_SECRET') ??
    process.env.JWT_ACCESS_SECRET ??
    ''
  ).trim();

  if (configured && configured !== PLACEHOLDER_SECRET && configured.length >= 16) {
    return configured;
  }

  const nodeEnv = config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'test') {
    return TEST_JWT_ACCESS_FALLBACK;
  }

  throw new Error('JWT_ACCESS_SECRET must be set to a strong secret outside test mode.');
}

export function resolveJwtRefreshSecret(config?: ConfigService): string {
  const configured = (
    config?.get<string>('JWT_REFRESH_SECRET') ??
    process.env.JWT_REFRESH_SECRET ??
    ''
  ).trim();

  if (configured && configured !== PLACEHOLDER_SECRET && configured.length >= 16) {
    return configured;
  }

  const nodeEnv = config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'test') {
    return TEST_JWT_REFRESH_FALLBACK;
  }

  throw new Error('JWT_REFRESH_SECRET must be set to a strong secret outside test mode.');
}

export function resolveAccessTtlSeconds(config?: ConfigService): number {
  const raw = Number(
    config?.get<string>('JWT_ACCESS_TTL_SECONDS') ?? process.env.JWT_ACCESS_TTL_SECONDS ?? '900',
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 900;
}

export function resolveRefreshTtlDays(config?: ConfigService): number {
  const raw = Number(
    config?.get<string>('JWT_REFRESH_TTL_DAYS') ?? process.env.JWT_REFRESH_TTL_DAYS ?? '7',
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 7;
}
