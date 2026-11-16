import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailVerificationNotifier } from './email-verification.notifier';

describe('EmailVerificationNotifier', () => {
  const originalFetch = global.fetch;
  const envKeys = [
    'RESEND_API_KEY',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_SECURE',
    'EMAIL_FROM',
    'FRONTEND_URL',
    'CORS_ORIGIN',
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('builds verification URLs stripping trailing slashes and reporting mail transport state', () => {
    const plainNotifier = new EmailVerificationNotifier(
      new ConfigService({ FRONTEND_URL: 'https://apuestas.vercel.app/' }),
    );
    expect(plainNotifier.hasExternalMailTransport()).toBe(false);
    expect(plainNotifier.buildVerificationUrl('tok+1/2')).toBe(
      'https://apuestas.vercel.app/verificar-correo?token=tok%2B1%2F2',
    );

    const resendNotifier = new EmailVerificationNotifier(
      new ConfigService({ RESEND_API_KEY: 're_live_123' }),
    );
    expect(resendNotifier.hasExternalMailTransport()).toBe(true);

    const smtpNotifier = new EmailVerificationNotifier(
      new ConfigService({ SMTP_HOST: 'smtp.example.com' }),
    );
    expect(smtpNotifier.hasExternalMailTransport()).toBe(true);
  });

  it('dispatches verification emails through Resend HTTPS API when RESEND_API_KEY is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"id":"email_1"}'),
    });
    global.fetch = fetchMock as typeof fetch;

    const notifier = new EmailVerificationNotifier(
      new ConfigService({
        RESEND_API_KEY: 're_test_key',
        FRONTEND_URL: 'https://apuestas-utpl.vercel.app',
        EMAIL_FROM: 'UTPL <noreply@utpl.edu.ec>',
      }),
    );

    await notifier.sendVerificationToken({
      userId: 'user-1',
      email: 'estudiante@utpl.edu.ec',
      rawToken: 'raw-token-abc',
      expiresAt: new Date('2026-11-16T12:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_key');

    const payload = JSON.parse(init.body as string) as {
      from: string;
      to: string[];
      html: string;
    };
    expect(payload.from).toBe('UTPL <noreply@utpl.edu.ec>');
    expect(payload.to).toEqual(['estudiante@utpl.edu.ec']);
    expect(payload.html).toContain(
      'https://apuestas-utpl.vercel.app/verificar-correo?token=raw-token-abc',
    );
  });

  it('throws descriptive error when Resend API returns non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Invalid recipient'),
    }) as typeof fetch;

    const notifier = new EmailVerificationNotifier(
      new ConfigService({ RESEND_API_KEY: 're_test_key' }),
    );

    await expect(
      notifier.sendVerificationToken({
        userId: 'user-1',
        email: 'bad@utpl.edu.ec',
        rawToken: 'tok-1',
        expiresAt: new Date('2026-11-16T12:00:00.000Z'),
      }),
    ).rejects.toThrow('Resend HTTP 422: Invalid recipient');
  });

  it('dispatches verification emails through nodemailer SMTP when SMTP_HOST is configured', async () => {
    const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'smtp-id-1' });
    const createTransportSpy = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail: sendMailMock } as unknown as nodemailer.Transporter);

    const notifier = new EmailVerificationNotifier(
      new ConfigService({
        SMTP_HOST: 'sandbox.smtp.mailtrap.io',
        SMTP_PORT: '2525',
        SMTP_USER: 'smtp-user',
        SMTP_PASS: 'smtp-pass',
        FRONTEND_URL: 'http://localhost:3000',
        EMAIL_FROM: 'Apuestas <noreply@local.test>',
      }),
    );

    await notifier.sendVerificationToken({
      userId: 'user-2',
      email: 'bettorsmtp@utpl.edu.ec',
      rawToken: 'smtp-token-xyz',
      expiresAt: new Date('2026-11-16T12:00:00.000Z'),
    });

    expect(createTransportSpy).toHaveBeenCalledWith({
      host: 'sandbox.smtp.mailtrap.io',
      port: 2525,
      secure: false,
      auth: { user: 'smtp-user', pass: 'smtp-pass' },
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Apuestas <noreply@local.test>',
        to: 'bettorsmtp@utpl.edu.ec',
        text: expect.stringContaining(
          'http://localhost:3000/verificar-correo?token=smtp-token-xyz',
        ) as string,
      }),
    );
  });
});
