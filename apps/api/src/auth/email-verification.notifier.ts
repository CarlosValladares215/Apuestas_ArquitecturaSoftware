import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface VerificationNotification {
  userId: string;
  email: string;
  rawToken: string;
  expiresAt: Date;
}

const verificationLogger = new Logger('EmailVerificationNotifier');

/**
 * Sends email verification links via Resend HTTP API, SMTP (nodemailer),
 * or non-production fallback logging when no external mail provider is configured.
 */
@Injectable()
export class EmailVerificationNotifier {
  constructor(@Optional() private readonly config?: ConfigService) {}

  buildVerificationUrl(rawToken: string): string {
    const frontendUrl = (
      this.config?.get<string>('FRONTEND_URL') ??
      process.env.FRONTEND_URL ??
      this.config?.get<string>('CORS_ORIGIN')?.split(',')[0] ??
      'http://localhost:3000'
    )
      .trim()
      .replace(/\/$/, '');

    return `${frontendUrl}/verificar-correo?token=${encodeURIComponent(rawToken)}`;
  }

  hasExternalMailTransport(): boolean {
    const resendKey = (
      this.config?.get<string>('RESEND_API_KEY') ??
      process.env.RESEND_API_KEY ??
      ''
    ).trim();
    const smtpHost = (this.config?.get<string>('SMTP_HOST') ?? process.env.SMTP_HOST ?? '').trim();

    return Boolean(resendKey || smtpHost);
  }

  async sendVerificationToken(input: VerificationNotification): Promise<void> {
    const verificationUrl = this.buildVerificationUrl(input.rawToken);
    const resendKey = (
      this.config?.get<string>('RESEND_API_KEY') ??
      process.env.RESEND_API_KEY ??
      ''
    ).trim();
    const smtpHost = (this.config?.get<string>('SMTP_HOST') ?? process.env.SMTP_HOST ?? '').trim();
    const fromAddress = (
      this.config?.get<string>('EMAIL_FROM') ??
      process.env.EMAIL_FROM ??
      'Apuestas UTPL <no-reply@apuestas-utpl.edu.ec>'
    ).trim();

    if (resendKey) {
      await this.sendViaResend(resendKey, fromAddress, input.email, verificationUrl);
      return;
    }

    if (smtpHost) {
      await this.sendViaSmtp(smtpHost, fromAddress, input.email, verificationUrl);
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      verificationLogger.log(
        `Verification link for ${input.email} (expires ${input.expiresAt.toISOString()}): ${verificationUrl}`,
      );
    } else {
      verificationLogger.warn(
        `No RESEND_API_KEY or SMTP_HOST configured in production; verification email for user ${input.userId} was not dispatched externally.`,
      );
    }
  }

  private async sendViaResend(
    apiKey: string,
    from: string,
    to: string,
    verificationUrl: string,
  ): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: 'Verifica tu correo — Plataforma de Apuestas Deportivas UTPL',
        html: `<p>Hola,</p><p>Confirma tu correo electrónico haciendo clic en el siguiente enlace:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>El enlace caduca en 24 horas.</p>`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend HTTP ${String(response.status)}: ${detail}`);
    }
  }

  private async sendViaSmtp(
    host: string,
    from: string,
    to: string,
    verificationUrl: string,
  ): Promise<void> {
    const port = Number(this.config?.get<string>('SMTP_PORT') ?? process.env.SMTP_PORT ?? '587');
    const user = (this.config?.get<string>('SMTP_USER') ?? process.env.SMTP_USER ?? '').trim();
    const pass = (this.config?.get<string>('SMTP_PASS') ?? process.env.SMTP_PASS ?? '').trim();
    const secure =
      (this.config?.get<string>('SMTP_SECURE') ?? process.env.SMTP_SECURE ?? 'false') === 'true';

    const transporter = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });

    await transporter.sendMail({
      from,
      to,
      subject: 'Verifica tu correo — Plataforma de Apuestas Deportivas UTPL',
      text: `Confirma tu cuenta abriendo este enlace (vigente 24h): ${verificationUrl}`,
      html: `<p>Confirma tu cuenta haciendo clic en el siguiente enlace (vigente 24h):</p><p><a href="${verificationUrl}">${verificationUrl}</a></p>`,
    });
  }
}
