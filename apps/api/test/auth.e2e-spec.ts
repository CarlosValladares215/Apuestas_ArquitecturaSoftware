import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  AuditLogEntryView,
  AuthSessionResponse,
  AuthUserView,
  PaginatedResponse,
  RegisterResponse,
  TotpSetupResponse,
  normalizeEmail,
} from '@apuestas/shared';
import { AppModule } from '../src/app.module';
import {
  EmailVerificationNotifier,
  VerificationNotification,
} from '../src/auth/email-verification.notifier';
import { PasswordService } from '../src/auth/password.service';
import { configureAppSecurity } from '../src/bootstrap';
import { USER_REPOSITORY, UserRepository } from '../src/users/user.repository';

function toCookieLines(headers: unknown): string[] {
  if (Array.isArray(headers)) {
    return headers.filter((item): item is string => typeof item === 'string');
  }
  return typeof headers === 'string' ? [headers] : [];
}

function parseCookiesFromResponse(headers: unknown): Record<string, string> {
  const list = toCookieLines(headers);
  const jar: Record<string, string> = {};

  for (const headerLine of list) {
    const firstPair = headerLine.split(';')[0] ?? '';
    const eqIndex = firstPair.indexOf('=');
    if (eqIndex > 0) {
      const name = firstPair.slice(0, eqIndex).trim();
      const val = firstPair.slice(eqIndex + 1).trim();
      jar[name] = val;
    }
  }

  return jar;
}

describe('Auth, RBAC & Audit (e2e)', () => {
  let app: INestApplication<App>;
  let sentVerifications: VerificationNotification[] = [];
  let userRepo: UserRepository;
  let passwordService: PasswordService;

  const verifierStub: EmailVerificationNotifier = {
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects underage registration, role injection, and invalid captcha with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'minor@utpl.edu.ec',
        password: 'SeguraPassword2026',
        isAdultConfirmed: false,
        captchaToken: 'test-captcha-ok',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'escalator@utpl.edu.ec',
        password: 'SeguraPassword2026',
        isAdultConfirmed: true,
        captchaToken: 'test-captcha-ok',
        role: 'admin',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'bot@utpl.edu.ec',
        password: 'SeguraPassword2026',
        isAdultConfirmed: true,
        captchaToken: 'invalid-captcha',
      })
      .expect(400);
  });

  it('enforces email verification before login and single-use verification tokens', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: '  Bettor.One@UTPL.EDU.EC ',
        password: 'SeguraPassword2026',
        isAdultConfirmed: true,
        captchaToken: 'test-captcha-ok',
      })
      .expect(201);

    const regBody = registerRes.body as RegisterResponse;
    expect(regBody.user.email).toBe('bettor.one@utpl.edu.ec');
    expect(regBody.user.role).toBe('bettor');
    expect(regBody.user.emailVerified).toBe(false);
    expect(regBody.verificationRequired).toBe(true);
    expect(JSON.stringify(regBody)).not.toContain('passwordHash');

    // Duplicate email with different case must fail with 409
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'bettor.one@utpl.edu.ec',
        password: 'SeguraPassword2026',
        isAdultConfirmed: true,
        captchaToken: 'test-captcha-ok',
      })
      .expect(409);

    // Unverified user cannot log in
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'bettor.one@utpl.edu.ec',
        password: 'SeguraPassword2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(403);

    const captured = sentVerifications.find((entry) => entry.email === 'bettor.one@utpl.edu.ec');
    expect(captured?.rawToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: captured?.rawToken })
      .expect(200);

    // Verification token cannot be reused
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: captured?.rawToken })
      .expect(400);
  });

  it('issues httpOnly cookies on login, rotates refresh tokens, and revokes family on reuse', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'bettor.one@utpl.edu.ec',
        password: 'SeguraPassword2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);

    const rawCookieLines = toCookieLines(loginRes.headers['set-cookie']);
    expect(
      rawCookieLines.some((line) => line.includes('access_token=') && line.includes('HttpOnly')),
    ).toBe(true);
    expect(
      rawCookieLines.some((line) => line.includes('refresh_token=') && line.includes('HttpOnly')),
    ).toBe(true);

    const cookies1 = parseCookiesFromResponse(rawCookieLines);
    expect(cookies1.access_token).toBeTruthy();
    expect(cookies1.refresh_token).toBeTruthy();

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', [`access_token=${cookies1.access_token ?? ''}`])
      .expect(200);
    expect((meRes.body as AuthSessionResponse).user.email).toBe('bettor.one@utpl.edu.ec');

    // Rotate refresh token once
    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refresh_token=${cookies1.refresh_token ?? ''}`])
      .expect(200);

    const cookies2 = parseCookiesFromResponse(refreshRes.headers['set-cookie']);
    expect(cookies2.access_token).toBeTruthy();
    expect(cookies2.refresh_token).toBeTruthy();
    expect(cookies2.refresh_token).not.toBe(cookies1.refresh_token);

    // Replay the old rotated refresh_token -> reuse detection revokes whole family
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refresh_token=${cookies1.refresh_token ?? ''}`])
      .expect(401);

    // Even the latest valid token in that compromised family must now be rejected
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refresh_token=${cookies2.refresh_token ?? ''}`])
      .expect(401);
  });

  it('enrolls and enforces TOTP 2FA during login and supports clean logout', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'bettor.one@utpl.edu.ec',
        password: 'SeguraPassword2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);

    const cookies = parseCookiesFromResponse(loginRes.headers['set-cookie']);

    const setupRes = await request(app.getHttpServer())
      .post('/auth/2fa/setup')
      .set('Cookie', [`access_token=${cookies.access_token ?? ''}`])
      .expect(200);
    const setupBody = setupRes.body as TotpSetupResponse;
    expect(setupBody.secret).toBeTruthy();
    expect(setupBody.otpauthUri).toContain('otpauth://totp/');

    // Wrong code does not activate 2FA
    await request(app.getHttpServer())
      .post('/auth/2fa/enable')
      .set('Cookie', [`access_token=${cookies.access_token ?? ''}`])
      .send({ code: '000000' })
      .expect(400);

    const validCode = new OTPAuth.TOTP({
      issuer: 'ApuestasDeportivasUTPL',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(setupBody.secret),
    }).generate();

    const enableRes = await request(app.getHttpServer())
      .post('/auth/2fa/enable')
      .set('Cookie', [`access_token=${cookies.access_token ?? ''}`])
      .send({ code: validCode })
      .expect(200);
    expect((enableRes.body as { enabled: boolean }).enabled).toBe(true);

    // Login without TOTP fails, login with TOTP succeeds
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'bettor.one@utpl.edu.ec',
        password: 'SeguraPassword2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(401);

    const login2fa = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'bettor.one@utpl.edu.ec',
        password: 'SeguraPassword2026',
        captchaToken: 'test-captcha-ok',
        totpCode: validCode,
      })
      .expect(200);

    const session2fa = parseCookiesFromResponse(login2fa.headers['set-cookie']);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [
        `access_token=${session2fa.access_token ?? ''}`,
        `refresh_token=${session2fa.refresh_token ?? ''}`,
      ])
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [`refresh_token=${session2fa.refresh_token ?? ''}`])
      .expect(401);
  });

  it('locks account temporarily after 5 consecutive failed logins', async () => {
    const email = normalizeEmail('locktarget@utpl.edu.ec');
    const hash = await passwordService.hash('ValidPass2026');
    await userRepo.create({
      email,
      passwordHash: hash,
      role: 'bettor',
      adultConfirmedAt: new Date(),
      emailVerifiedAt: new Date(),
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email,
          password: 'WrongPassword99',
          captchaToken: 'test-captcha-ok',
        })
        .expect(401);
    }

    // 6th attempt even with correct password must remain locked (403)
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: 'ValidPass2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(403);
  });

  it('enforces default-deny RBAC across anonymous, bettor, operator, and admin roles and exposes AuditLog', async () => {
    // Seed operator and admin directly via repository (trusted server provisioning)
    const adminPassHash = await passwordService.hash('AdminSegura2026');
    const operatorPassHash = await passwordService.hash('OperatorSegura2026');

    const adminUser = await userRepo.create({
      email: 'admin@utpl.edu.ec',
      passwordHash: adminPassHash,
      role: 'admin',
      adultConfirmedAt: new Date(),
      emailVerifiedAt: new Date(),
    });

    const operatorUser = await userRepo.create({
      email: 'operator@utpl.edu.ec',
      passwordHash: operatorPassHash,
      role: 'operator',
      adultConfirmedAt: new Date(),
      emailVerifiedAt: new Date(),
    });

    // Anonymous requests must receive 401
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).post('/auth/2fa/setup').expect(401);
    await request(app.getHttpServer())
      .post('/auth/2fa/enable')
      .send({ code: '123456' })
      .expect(401);
    await request(app.getHttpServer()).get('/admin/users').expect(401);
    await request(app.getHttpServer())
      .patch(`/admin/users/${operatorUser.id}/role`)
      .send({ role: 'bettor' })
      .expect(401);
    await request(app.getHttpServer()).get('/admin/audit-logs').expect(401);

    // Operator receives 403 on admin endpoints
    const opLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'operator@utpl.edu.ec',
        password: 'OperatorSegura2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);
    const opCookies = parseCookiesFromResponse(opLogin.headers['set-cookie']);

    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Cookie', [`access_token=${opCookies.access_token ?? ''}`])
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/admin/users/${operatorUser.id}/role`)
      .set('Cookie', [`access_token=${opCookies.access_token ?? ''}`])
      .send({ role: 'admin' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set('Cookie', [`access_token=${opCookies.access_token ?? ''}`])
      .expect(403);

    // Admin can list users, promote/change another user's role, cannot demote self, and reads audit logs
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@utpl.edu.ec',
        password: 'AdminSegura2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);
    const adminCookies = parseCookiesFromResponse(adminLogin.headers['set-cookie']);
    const adminCookieHeader = [`access_token=${adminCookies.access_token ?? ''}`];

    const usersRes = await request(app.getHttpServer())
      .get('/admin/users?page=1&pageSize=20')
      .set('Cookie', adminCookieHeader)
      .expect(200);
    const usersBody = usersRes.body as PaginatedResponse<AuthUserView>;
    expect(usersBody.total).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(usersBody)).not.toContain('passwordHash');
    expect(JSON.stringify(usersBody)).not.toContain('totpSecretEncrypted');

    const bettorUser = usersBody.items.find((u) => u.email === 'bettor.one@utpl.edu.ec');
    expect(bettorUser).toBeDefined();

    // Admin cannot change own role
    await request(app.getHttpServer())
      .patch(`/admin/users/${adminUser.id}/role`)
      .set('Cookie', adminCookieHeader)
      .send({ role: 'bettor' })
      .expect(400);

    const roleChangeRes = await request(app.getHttpServer())
      .patch(`/admin/users/${bettorUser?.id ?? ''}/role`)
      .set('Cookie', adminCookieHeader)
      .send({ role: 'operator' })
      .expect(200);
    expect((roleChangeRes.body as AuthSessionResponse).user.role).toBe('operator');

    const auditRes = await request(app.getHttpServer())
      .get('/admin/audit-logs?page=1&pageSize=50')
      .set('Cookie', adminCookieHeader)
      .expect(200);
    const auditBody = auditRes.body as PaginatedResponse<AuditLogEntryView>;
    const actions = new Set(auditBody.items.map((entry) => entry.action));

    expect(actions.has('AUTH_REGISTER')).toBe(true);
    expect(actions.has('AUTH_EMAIL_VERIFIED')).toBe(true);
    expect(actions.has('AUTH_LOGIN_SUCCESS')).toBe(true);
    expect(actions.has('AUTH_LOGIN_FAILED')).toBe(true);
    expect(actions.has('AUTH_LOCKED')).toBe(true);
    expect(actions.has('AUTH_REFRESH')).toBe(true);
    expect(actions.has('AUTH_REFRESH_REUSE_DETECTED')).toBe(true);
    expect(actions.has('AUTH_2FA_ENABLED')).toBe(true);
    expect(actions.has('USER_ROLE_CHANGED')).toBe(true);
  });

  it('enforces @nestjs/throttler rate limiting (429) on login bursts', async () => {
    const throttledModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const throttledApp: INestApplication<App> = throttledModule.createNestApplication();
    configureAppSecurity(throttledApp);
    await throttledApp.init();

    try {
      const statuses: number[] = [];
      for (let i = 0; i < 20; i += 1) {
        const res = await request(throttledApp.getHttpServer()).post('/auth/login').send({
          email: 'nobody@utpl.edu.ec',
          password: 'WrongPassword123',
          captchaToken: 'test-captcha-ok',
        });
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
    } finally {
      await throttledApp.close();
    }
  });
});
