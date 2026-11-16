import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditLogEntryView, PaginatedResponse } from '@apuestas/shared';
import { AppModule } from '../src/app.module';
import {
  EmailVerificationNotifier,
  VerificationNotification,
} from '../src/auth/email-verification.notifier';
import { PasswordService } from '../src/auth/password.service';
import { configureAppSecurity } from '../src/bootstrap';
import { USER_REPOSITORY, UserRepository } from '../src/users/user.repository';
import { PayphoneService } from '../src/wallet/services/payphone.service';

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

describe('Cross-Spec Integration: Auth + Wallet + Matches + Unified Audit (e2e)', () => {
  let app: INestApplication<App>;
  let sentVerifications: VerificationNotification[] = [];
  let userRepo: UserRepository;
  let passwordService: PasswordService;
  let payphoneService: PayphoneService;

  const verifierStub: Pick<
    EmailVerificationNotifier,
    'buildVerificationUrl' | 'hasExternalMailTransport' | 'sendVerificationToken'
  > = {
    buildVerificationUrl(rawToken: string): string {
      return `http://localhost:3000/verificar-correo?token=${encodeURIComponent(rawToken)}`;
    },
    hasExternalMailTransport(): boolean {
      return false;
    },
    sendVerificationToken(input: VerificationNotification): Promise<void> {
      sentVerifications.push(input);
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    sentVerifications = [];
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailVerificationNotifier)
      .useValue(verifierStub)
      .compile();

    app = moduleRef.createNestApplication();
    configureAppSecurity(app);
    await app.init();

    userRepo = moduleRef.get<UserRepository>(USER_REPOSITORY);
    passwordService = moduleRef.get<PasswordService>(PasswordService);
    payphoneService = moduleRef.get<PayphoneService>(PayphoneService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a unified user journey across Spec 2, Spec 3, and Spec 4 and consolidates every event into AuditLog', async () => {
    // 1. Register & verify bettor (Spec 2)
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'jugador.integracion@utpl.edu.ec',
        password: 'IntegracionPass2026',
        isAdultConfirmed: true,
        captchaToken: 'test-captcha-ok',
      })
      .expect(201);

    const tokenEntry = sentVerifications.find(
      (item) => item.email === 'jugador.integracion@utpl.edu.ec',
    );
    expect(tokenEntry?.rawToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: tokenEntry?.rawToken })
      .expect(200);

    const bettorLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'jugador.integracion@utpl.edu.ec',
        password: 'IntegracionPass2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);
    const bettorCookie = extractAccessCookie(bettorLogin.headers['set-cookie']);

    // 2. Deposit into authenticated bettor's wallet via Payphone sandbox (Spec 3 + Spec 2 JWT identity)
    const intentRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/intent')
      .set('Cookie', [bettorCookie])
      .send({ amount: 40, currency: 'USD' })
      .expect(201);

    const intentBody = intentRes.body as { clientTransactionId: string };
    jest.spyOn(payphoneService, 'verifyWithPayphone').mockResolvedValueOnce({
      status: 'Approved',
      amountInCents: 4000,
      currency: 'USD',
      clientTransactionId: intentBody.clientTransactionId,
      payphoneTransactionId: 'PAY_INT_001',
    });

    await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/confirm')
      .set('Cookie', [bettorCookie])
      .send({
        clientTransactionId: intentBody.clientTransactionId,
        payphoneTransactionId: 'PAY_INT_001',
      })
      .expect(200);

    // 3. Bettor can read matchboard publicly but cannot create matches (Spec 4 + Spec 2 RBAC)
    await request(app.getHttpServer()).get('/matches').expect(200);
    await request(app.getHttpServer())
      .post('/matches')
      .set('Cookie', [bettorCookie])
      .send({
        competitionId: 'comp_ligapro',
        competitionName: 'LigaPro',
        country: 'Ecuador',
        homeTeam: 'Barcelona SC',
        awayTeam: 'Emelec',
        kickoffAt: '2027-05-10T20:00:00.000Z',
      })
      .expect(403);

    // 4. Seed admin, create match, and inspect unified AuditLog across Auth + Wallet + Matches
    const adminHash = await passwordService.hash('AdminIntegracion2026');
    await userRepo.create({
      email: 'admin.integracion@utpl.edu.ec',
      passwordHash: adminHash,
      role: 'admin',
      adultConfirmedAt: new Date(),
      emailVerifiedAt: new Date(),
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin.integracion@utpl.edu.ec',
        password: 'AdminIntegracion2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);
    const adminCookie = extractAccessCookie(adminLogin.headers['set-cookie']);

    await request(app.getHttpServer())
      .post('/matches')
      .set('Cookie', [adminCookie])
      .send({
        competitionId: 'comp_ligapro',
        competitionName: 'LigaPro',
        country: 'Ecuador',
        homeTeam: 'Barcelona SC',
        awayTeam: 'Emelec',
        kickoffAt: '2027-05-10T20:00:00.000Z',
      })
      .expect(201);

    const auditRes = await request(app.getHttpServer())
      .get('/admin/audit-logs?page=1&pageSize=50')
      .set('Cookie', [adminCookie])
      .expect(200);

    const actions = new Set(
      (auditRes.body as PaginatedResponse<AuditLogEntryView>).items.map((item) => item.action),
    );

    expect(actions.has('AUTH_REGISTER')).toBe(true);
    expect(actions.has('AUTH_EMAIL_VERIFIED')).toBe(true);
    expect(actions.has('AUTH_LOGIN_SUCCESS')).toBe(true);
    expect(actions.has('DEPOSIT_INTENT_CREATED')).toBe(true);
    expect(actions.has('DEPOSIT_CONFIRMED')).toBe(true);
    expect(actions.has('MATCH_CREATED')).toBe(true);
  });
});
