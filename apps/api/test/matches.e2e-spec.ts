import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppRole } from '@apuestas/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { configureAppSecurity } from '../src/bootstrap';
import { USER_REPOSITORY, UserRepository } from '../src/users/user.repository';

function extractAccessCookie(headers: unknown): string {
  const list = Array.isArray(headers)
    ? headers.filter((item): item is string => typeof item === 'string')
    : typeof headers === 'string'
      ? [headers]
      : [];

  for (const line of list) {
    const first = line.split(';')[0] ?? '';
    if (first.startsWith('access_token=')) {
      return first;
    }
  }
  return '';
}

describe('MatchesController (e2e)', () => {
  let app: INestApplication<App>;
  let userRepo: UserRepository;
  let passwordService: PasswordService;

  async function loginAsRole(email: string, role: AppRole): Promise<string> {
    const hash = await passwordService.hash('MatchesPass2026');
    await userRepo.create({
      email,
      passwordHash: hash,
      role,
      adultConfirmedAt: new Date(),
      emailVerifiedAt: new Date(),
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: 'MatchesPass2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);

    return extractAccessCookie(loginRes.headers['set-cookie']);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureAppSecurity(app);
    userRepo = moduleRef.get<UserRepository>(USER_REPOSITORY);
    passwordService = moduleRef.get<PasswordService>(PasswordService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /matches returns the matchboard publicly with markets and selections', async () => {
    const response = await request(app.getHttpServer()).get('/matches').expect(200);
    const matches = response.body as Array<{
      id: string;
      status: string;
      markets: Array<{ id: string; status: string }>;
    }>;

    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(matches[0]?.markets.length).toBeGreaterThan(0);
  });

  it('enforces real JWT RBAC: rejects unauthenticated (401), spoofed headers (401), and bettor (403)', async () => {
    await request(app.getHttpServer())
      .post('/matches')
      .send({
        competitionId: 'comp_ligapro',
        competitionName: 'LigaPro Serie A',
        country: 'Ecuador',
        homeTeam: 'El Nacional',
        awayTeam: 'Macará',
        kickoffAt: '2027-02-20T20:00:00.000Z',
      })
      .expect(401);

    // Spoofing x-user-role without valid JWT session must still be rejected with 401
    await request(app.getHttpServer())
      .post('/matches')
      .set('x-user-role', 'admin')
      .send({
        competitionId: 'comp_ligapro',
        competitionName: 'LigaPro Serie A',
        country: 'Ecuador',
        homeTeam: 'El Nacional',
        awayTeam: 'Macará',
        kickoffAt: '2027-02-20T20:00:00.000Z',
      })
      .expect(401);

    const bettorCookie = await loginAsRole('matches.bettor@utpl.edu.ec', 'bettor');

    await request(app.getHttpServer())
      .post('/matches')
      .set('Cookie', [bettorCookie])
      .send({
        competitionId: 'comp_ligapro',
        competitionName: 'LigaPro Serie A',
        country: 'Ecuador',
        homeTeam: 'El Nacional',
        awayTeam: 'Macará',
        kickoffAt: '2027-02-20T20:00:00.000Z',
      })
      .expect(403);
  });

  it('allows authenticated operator/admin to create match, update odds, transition status, and run API-Football sync', async () => {
    const operatorCookie = await loginAsRole('matches.operator@utpl.edu.ec', 'operator');
    const adminCookie = await loginAsRole('matches.admin@utpl.edu.ec', 'admin');

    const createRes = await request(app.getHttpServer())
      .post('/matches')
      .set('Cookie', [operatorCookie])
      .send({
        competitionId: 'comp_ligapro',
        competitionName: 'LigaPro Serie A',
        country: 'Ecuador',
        homeTeam: 'Deportivo Cuenca',
        awayTeam: 'Orense SC',
        kickoffAt: '2027-03-10T20:00:00.000Z',
      })
      .expect(201);

    const createdMatch = createRes.body as {
      id: string;
      status: string;
      markets: Array<{ id: string; status: string }>;
    };
    expect(createdMatch.status).toBe('programado');

    const defaultMarketId = createdMatch.markets[0]?.id ?? '';

    await request(app.getHttpServer())
      .patch(`/matches/${createdMatch.id}/markets/${defaultMarketId}/odds`)
      .set('Cookie', [operatorCookie])
      .send({
        selections: [{ key: 'HOME', odds: 2.05 }],
      })
      .expect(200);

    const liveRes = await request(app.getHttpServer())
      .patch(`/matches/${createdMatch.id}/status`)
      .set('Cookie', [operatorCookie])
      .send({
        status: 'en_vivo',
        homeScore: 1,
        awayScore: 0,
        elapsedMinute: 12,
      })
      .expect(200);

    const liveBody = liveRes.body as {
      status: string;
      markets: Array<{ isPreMatch: boolean; status: string }>;
    };
    expect(liveBody.status).toBe('en_vivo');
    expect(liveBody.markets.every((m) => !m.isPreMatch || m.status === 'closed')).toBe(true);

    const syncRes = await request(app.getHttpServer())
      .post('/matches/sync/run')
      .set('Cookie', [adminCookie])
      .send({ purpose: 'live' })
      .expect(200);

    const syncBody = syncRes.body as { usedToday: number; lastSyncOutcome: string };
    expect(syncBody.usedToday).toBeGreaterThanOrEqual(1);
    expect(syncBody.lastSyncOutcome).toBe('updated');
  });
});
