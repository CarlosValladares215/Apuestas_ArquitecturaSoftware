import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppSecurity } from '../src/bootstrap';
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

describe('WalletController (e2e)', () => {
  let app: INestApplication<App>;
  let payphoneService: PayphoneService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureAppSecurity(app);
    payphoneService = moduleRef.get<PayphoneService>(PayphoneService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/wallet/balance returns initial 0 balance', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/wallet/balance')
      .set('x-user-id', 'usr_e2e_bettor_1')
      .expect(200);

    const body = response.body as unknown as BalancePayload;
    expect(body).toMatchObject({
      userId: 'usr_e2e_bettor_1',
      realBalance: 0,
      bonusBalance: 0,
      totalBalance: 0,
      currency: 'USD',
    });
  });

  it('POST /api/v1/wallet/deposits/intent creates a pending intent', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/intent')
      .set('x-user-id', 'usr_e2e_bettor_1')
      .set('idempotency-key', 'IDEMP_E2E_INTENT_1')
      .send({ amount: 50.0, currency: 'USD' })
      .expect(201);

    const body = response.body as unknown as IntentPayload;
    expect(body).toMatchObject({
      status: 'PENDING',
      amount: 50.0,
      currency: 'USD',
    });
    expect(body.clientTransactionId).toBeDefined();
    expect(body.payphoneUrl).toBeDefined();
  });

  it('POST /api/v1/wallet/deposits/confirm credits balance after verified server-to-server confirmation', async () => {
    const userId = 'usr_e2e_bettor_2';

    // 1. Create intent
    const intentRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/intent')
      .set('x-user-id', userId)
      .send({ amount: 25.0 })
      .expect(201);

    const intentBody = intentRes.body as unknown as IntentPayload;
    const clientTxId = intentBody.clientTransactionId;

    // Mock Payphone sandbox verification
    jest.spyOn(payphoneService, 'verifyWithPayphone').mockResolvedValueOnce({
      status: 'Approved',
      amountInCents: 2500,
      currency: 'USD',
      clientTransactionId: clientTxId,
      payphoneTransactionId: 'PAYPHONE_E2E_123',
    });

    // 2. Confirm deposit
    const confirmRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/confirm')
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

    // 3. Verify balance endpoint reflects new balance
    const balanceRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/balance')
      .set('x-user-id', userId)
      .expect(200);

    const balanceBody = balanceRes.body as unknown as BalancePayload;
    expect(balanceBody.realBalance).toBe(25.0);

    // 4. Verify movements endpoint lists deposit
    const movementsRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/movements')
      .set('x-user-id', userId)
      .expect(200);

    const movementsBody = movementsRes.body as unknown as MovementsPayload;
    expect(movementsBody.total).toBe(1);
    expect(movementsBody.movements[0]?.amount).toBe(25.0);
    expect(movementsBody.movements[0]?.type).toBe('DEPOSIT');
  });

  it('POST /api/v1/wallet/debit successfully debits available balance and rejects overdraw', async () => {
    const userId = 'usr_e2e_bettor_3';

    // Seed $20.00
    const intentRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/deposits/intent')
      .set('x-user-id', userId)
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
      .send({
        clientTransactionId: intentBody.clientTransactionId,
        payphoneTransactionId: 'PAYPHONE_E2E_SEED',
      })
      .expect(200);

    // Debit $12.00
    const debitRes = await request(app.getHttpServer())
      .post('/api/v1/wallet/debit')
      .set('x-user-id', userId)
      .send({
        amount: 12.0,
        referenceCode: 'BET_STAKE_E2E_1',
        description: 'Apuesta en partido E2E',
      })
      .expect(200);

    const debitBody = debitRes.body as unknown as DebitPayload;
    expect(debitBody).toMatchObject({
      success: true,
      debitedAmount: 12.0,
      remainingBalance: 8.0,
    });

    // Overdraw attempt: Debit $10.00 when only $8.00 remain -> 422 Unprocessable Entity
    await request(app.getHttpServer())
      .post('/api/v1/wallet/debit')
      .set('x-user-id', userId)
      .send({
        amount: 10.0,
        referenceCode: 'BET_STAKE_E2E_FAIL',
        description: 'Apuesta sobregirada',
      })
      .expect(422);

    // Verify balance remains 8.0
    const balanceRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/balance')
      .set('x-user-id', userId)
      .expect(200);

    const balanceBody = balanceRes.body as unknown as BalancePayload;
    expect(balanceBody.realBalance).toBe(8.0);
  });
});
