import { Logger } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { normalizeEmail } from '@apuestas/shared';
import { createInitialMatchesSeed } from '../matches/matches.seed';

const seedLogger = new Logger('DatabaseSeed');

async function upsertInitialUser(
  prisma: PrismaClient,
  email: string,
  plainPassword: string,
  role: Role,
): Promise<void> {
  const normalized = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    seedLogger.log(`Seed user already exists (${role}): ${normalized}`);
    return;
  }

  const passwordHash = await argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const now = new Date();
  await prisma.user.create({
    data: {
      email: normalized,
      passwordHash,
      role,
      adultConfirmedAt: now,
      emailVerifiedAt: now,
    },
  });

  seedLogger.log(`Created initial ${role} user: ${normalized}`);
}

export async function runDatabaseSeed(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    seedLogger.warn('DATABASE_URL not set; skipping database seed.');
    return;
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? '').trim();
    const adminPassword = (process.env.SEED_ADMIN_PASSWORD ?? '').trim();
    if (adminEmail && adminPassword.length >= 10) {
      await upsertInitialUser(prisma, adminEmail, adminPassword, 'admin');
    } else {
      seedLogger.warn(
        'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (min 10 chars) not configured; skipping initial admin creation.',
      );
    }

    const operatorEmail = (process.env.SEED_OPERATOR_EMAIL ?? '').trim();
    const operatorPassword = (process.env.SEED_OPERATOR_PASSWORD ?? '').trim();
    if (operatorEmail && operatorPassword.length >= 10) {
      await upsertInitialUser(prisma, operatorEmail, operatorPassword, 'operator');
    }

    const initialMatches = createInitialMatchesSeed();
    const apiFootballKey = (process.env.API_FOOTBALL_KEY ?? '').trim();
    const hasRealApiFootballKey = Boolean(
      apiFootballKey &&
      apiFootballKey !== 'replace_with_api_football_sandbox_key' &&
      !apiFootballKey.startsWith('sandbox_'),
    );

    if (hasRealApiFootballKey) {
      const seedIds = initialMatches.map((match) => match.id);
      const removed = await prisma.match.deleteMany({
        where: { id: { in: seedIds } },
      });
      seedLogger.log(
        `API_FOOTBALL_KEY configured: skipped demo seed fixtures (cleaned ${String(removed.count)} legacy seed matches).`,
      );
      return;
    }

    for (const match of initialMatches) {
      await prisma.competition.upsert({
        where: { id: match.competition.id },
        update: {
          name: match.competition.name,
          country: match.competition.country,
        },
        create: {
          id: match.competition.id,
          name: match.competition.name,
          country: match.competition.country,
          sport: match.competition.sport,
          externalId: match.competition.externalId ?? null,
        },
      });

      const existingMatch = await prisma.match.findUnique({ where: { id: match.id } });
      if (!existingMatch) {
        await prisma.match.create({
          data: {
            id: match.id,
            competitionId: match.competitionId,
            externalId: match.externalId ?? null,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            kickoffAt: new Date(match.kickoffAt),
            status: match.status,
            homeScore: match.score.home,
            awayScore: match.score.away,
            elapsedMinute: match.elapsedMinute,
            markets: {
              create: match.markets.map((market) => ({
                id: market.id,
                type: market.type,
                name: market.name,
                isPreMatch: market.isPreMatch,
                status: market.status,
                closedReason: market.closedReason,
                selections: {
                  create: market.selections.map((sel) => ({
                    id: sel.id,
                    key: sel.key,
                    label: sel.label,
                    odds: sel.odds,
                  })),
                },
              })),
            },
          },
        });
        seedLogger.log(`Seeded initial match: ${match.homeTeam} vs ${match.awayTeam}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runDatabaseSeed().catch((error: unknown) => {
    seedLogger.error('Database seed failed', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
