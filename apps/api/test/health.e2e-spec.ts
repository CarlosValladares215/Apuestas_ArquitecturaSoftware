import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppSecurity } from '../src/bootstrap';

interface HealthPayload {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

describe('HealthController (e2e)', () => {
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

  it('GET /health returns 200 with HealthStatus and helmet security headers', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    const body = response.body as HealthPayload;

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api');
    expect(typeof body.version).toBe('string');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
