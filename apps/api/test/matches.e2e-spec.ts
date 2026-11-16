import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppSecurity } from '../src/bootstrap';

describe('MatchesController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureAppSecurity(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /matches returns the matchboard with markets and selections', async () => {
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

  it('enforces RBAC: rejects operator mutations from bettor or unauthenticated requests with 403', async () => {
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
      .expect(403);

    await request(app.getHttpServer())
      .post('/matches')
      .set('x-user-role', 'bettor')
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

  it('allows operator to create match, update manual odds, transition status, and run API-Football sync', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/matches')
      .set('x-user-role', 'operator')
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
      .set('x-user-role', 'operator')
      .send({
        selections: [{ key: 'HOME', odds: 2.05 }],
      })
      .expect(200);

    // Transition to en_vivo automatically closes pre-match markets
    const liveRes = await request(app.getHttpServer())
      .patch(`/matches/${createdMatch.id}/status`)
      .set('x-user-role', 'operator')
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

    // Sync status and run
    const syncRes = await request(app.getHttpServer())
      .post('/matches/sync/run')
      .set('x-user-role', 'admin')
      .send({ purpose: 'live' })
      .expect(200);

    const syncBody = syncRes.body as { usedToday: number; lastSyncOutcome: string };
    expect(syncBody.usedToday).toBeGreaterThanOrEqual(1);
    expect(syncBody.lastSyncOutcome).toBe('updated');
  });
});
