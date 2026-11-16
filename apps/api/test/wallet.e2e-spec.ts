import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { configureAppSecurity } from '../src/bootstrap';
import { USER_REPOSITORY, UserRepository } from '../src/users/user.repository';
import { PayphoneService } from '../src/wallet/services/payphone.service';

interface BalancePayload {
  userId: string;
  realBalance: number;
  bonusBalance: number;
  totalBalance: number;
  currency: string;
}

interface IntentPayload {
  intentId: string;
  clientTransactionId: string;
  amount: number;
  currency: string;
  status: string;
  payphoneUrl: string;
}

interface ConfirmPayload {
  success: boolean;
  status: string;
  creditedAmount: number;
  newRealBalance: number;
}

interface DebitPayload {
  success: boolean;
  debitedAmount: number;
  remainingBalance: number;
}

interface MovementsPayload {
  total: number;
  movements: Array<{
    amount: number;
    type: string;
  }>;
}

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

describe('WalletController (e2e)', () => {
  let app: INestApplication<App>;
  let payphoneService: PayphoneService;
  let userRepo: UserRepository;
  let passwordService: PasswordService;

  async function createVerifiedUserAndCookie(email: string): Promise<{
    userId: string;
    cookie: string;
  }> {
    const hash = await passwordService.hash('WalletPass2026');
    const created = await userRepo.create({
      email,
      passwordHash: hash,
      role: 'bettor',
      adultConfirmedAt: new Date(),
      emailVerifiedAt: new Date(),
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: 'WalletPass2026',
        captchaToken: 'test-captcha-ok',
      })
      .expect(200);

    return {
      userId: created.id,
      cookie: extractAccessCookie(loginRes.headers['set-cookie']),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureAppSecurity(app);
    payphoneService = moduleRef.get<PayphoneService>(PayphoneService);
    userRepo = moduleRef.get<UserRepository>(USER_REPOSITORY);
    passwordService = moduleRef.get<PasswordService>(PasswordService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated wallet calls with 401 and ignores spoofed x-user-id header', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/wallet/balance')
      .set('x-user-id', 'victim-id')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/intent')
      .send({ amount: 25.0 })
      .expect(401);
  });

  it('GET /api/v1/wallet/balance returns initial 0 balance for authenticated user', async () => {
    const bettor = await createVerifiedUserAndCookie('wallet.one@utpl.edu.ec');

    const response = await request(app.getHttpServer())
      .get('/api/v1/wallet/balance')
      .set('Cookie', [bettor.cookie])
      .expect(200);

    const body = response.body as unknown as BalancePayload;
    expect(body).toMatchObject({
      userId: bettor.userId,
      realBalance: 0,
      bonusBalance: 0,
      totalBalance: 0,
      currency: 'USD',
    });
  });

  it('enforces IDOR protection and credits balance after verified server-to-server confirmation', async () => {
    const owner = await createVerifiedUserAndCookie('wallet.two@utpl.edu.ec');
    const attacker = await createVerifiedUserAndCookie('wallet.attacker@utpl.edu.ec');

    const intentRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/intent')
      .set('Cookie', [owner.cookie])
      .set('idempotency-key', 'IDEMP_E2E_INTENT_1')
      .send({ amount: 25.0, currency: 'USD' })
      .expect(201);

    const intentBody = intentRes.body as unknown as IntentPayload;
    const clientTxId = intentBody.clientTransactionId;
    expect(intentBody.status).toBe('PENDING');

    // Different authenticated user cannot confirm owner's payment intent (403 IDOR defense)
    await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/confirm')
      .set('Cookie', [attacker.cookie])
      .send({
        clientTransactionId: clientTxId,
        payphoneTransactionId: 'PAYPHONE_HIJACK',
      })
      .expect(403);

    jest.spyOn(payphoneService, 'verifyWithPayphone').mockResolvedValueOnce({
      status: 'Approved',
      amountInCents: 2500,
      currency: 'USD',
      clientTransactionId: clientTxId,
      payphoneTransactionId: 'PAYPHONE_E2E_123',
    });

    const confirmRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/confirm')
      .set('Cookie', [owner.cookie])
      .send({
        clientTransactionId: clientTxId,
        payphoneTransactionId: 'PAYPHONE_E2E_123',
      })
      .expect(200);

    const confirmBody = confirmRes.body as unknown as ConfirmPayload;
    expect(confirmBody).toMatchObject({
      success: true,
      status: 'COMPLETED',
      creditedAmount: 25.0,
      newRealBalance: 25.0,
    });

    const balanceRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/balance')
      .set('Cookie', [owner.cookie])
      .expect(200);

    expect((balanceRes.body as unknown as BalancePayload).realBalance).toBe(25.0);

    const movementsRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/movements')
      .set('Cookie', [owner.cookie])
      .expect(200);

    const movementsBody = movementsRes.body as unknown as MovementsPayload;
    expect(movementsBody.total).toBe(1);
    expect(movementsBody.movements[0]?.amount).toBe(25.0);
    expect(movementsBody.movements[0]?.type).toBe('DEPOSIT');
  });

  it('POST /api/v1/wallet/debit successfully debits available balance and rejects overdraw', async () => {
    const bettor = await createVerifiedUserAndCookie('wallet.three@utpl.edu.ec');

    const intentRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/intent')
      .set('Cookie', [bettor.cookie])
      .send({ amount: 20.0 })
      .expect(201);

    const intentBody = intentRes.body as unknown as IntentPayload;
    jest.spyOn(payphoneService, 'verifyWithPayphone').mockResolvedValueOnce({
      status: 'Approved',
      amountInCents: 2000,
      currency: 'USD',
      clientTransactionId: intentBody.clientTransactionId,
      payphoneTransactionId: 'PAYPHONE_E2E_SEED',
    });

    await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/confirm')
      .set('Cookie', [bettor.cookie])
      .send({
        clientTransactionId: intentBody.clientTransactionId,
        payphoneTransactionId: 'PAYPHONE_E2E_SEED',
      })
      .expect(200);

    const debitRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/debit')
      .set('Cookie', [bettor.cookie])
      .send({
        amount: 12.0,
        referenceCode: 'BET_STAKE_E2E_1',
        description: 'Apuesta en partido E2E',
      })
      .expect(200);

    expect(debitRes.body as unknown as DebitPayload).toMatchObject({
      success: true,
      debitedAmount: 12.0,
      remainingBalance: 8.0,
    });

    await request(app.getHttpServer())
      .post('/api/v1/wallet/debit')
      .set('Cookie', [bettor.cookie])
      .send({
        amount: 10.0,
        referenceCode: 'BET_STAKE_E2E_FAIL',
        description: 'Apuesta sobregirada',
      })
      .expect(422);

    const balanceRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/balance')
      .set('Cookie', [bettor.cookie])
      .expect(200);

    expect((balanceRes.body as unknown as BalancePayload).realBalance).toBe(8.0);
  });
});
