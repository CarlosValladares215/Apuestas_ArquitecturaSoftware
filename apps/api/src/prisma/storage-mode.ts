import { ConfigService } from '@nestjs/config';

/**
 * Determines whether repositories should persist via Prisma (PostgreSQL) or in-memory adapters.
 * Explicitly setting AUTH_STORAGE_DRIVER overrides automatic test/database detection.
 */
export function isPrismaStorageEnabled(config?: Pick<ConfigService, 'get'>): boolean {
  const driver = (
    config?.get<string>('AUTH_STORAGE_DRIVER') ??
    process.env.AUTH_STORAGE_DRIVER ??
    'auto'
  )
    .trim()
    .toLowerCase();

  if (driver === 'memory') {
    return false;
  }

  const databaseUrl = (
    config?.get<string>('DATABASE_URL') ??
    process.env.DATABASE_URL ??
    ''
  ).trim();

  if (driver === 'prisma') {
    if (!databaseUrl) {
      throw new Error('AUTH_STORAGE_DRIVER=prisma requires DATABASE_URL to be configured.');
    }
    return true;
  }

  const nodeEnv = config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
  return Boolean(databaseUrl) && nodeEnv !== 'test';
}
