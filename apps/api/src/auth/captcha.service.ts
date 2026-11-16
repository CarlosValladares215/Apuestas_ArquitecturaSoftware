import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_ERROR_CODES } from '@apuestas/shared';

interface TurnstileVerifyResponse {
  success?: boolean;
}

@Injectable()
export class CaptchaService {
  constructor(@Optional() private readonly config?: ConfigService) {}

  /**
   * Validates anti-bot challenge tokens via Cloudflare Turnstile or deterministic mock mode.
   */
  async assertValid(token: string, remoteIp?: string | null): Promise<void> {
    const trimmed = token.trim();
    const provider = (
      this.config?.get<string>('CAPTCHA_PROVIDER') ??
      process.env.CAPTCHA_PROVIDER ??
      'mock'
    )
      .trim()
      .toLowerCase();

    if (!trimmed) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.CAPTCHA_INVALID,
        message: 'La verificación CAPTCHA es obligatoria.',
      });
    }

    if (provider === 'turnstile') {
      const secret = (
        this.config?.get<string>('CAPTCHA_SECRET_KEY') ??
        process.env.CAPTCHA_SECRET_KEY ??
        ''
      ).trim();

      if (!secret) {
        throw new BadRequestException({
          code: AUTH_ERROR_CODES.CAPTCHA_INVALID,
          message: 'El servicio CAPTCHA no está configurado correctamente en el servidor.',
        });
      }

      const body = new URLSearchParams({
        secret,
        response: trimmed,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      });

      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new BadRequestException({
          code: AUTH_ERROR_CODES.CAPTCHA_INVALID,
          message: 'No se pudo validar el CAPTCHA. Inténtalo nuevamente.',
        });
      }

      const payload = (await response.json()) as TurnstileVerifyResponse;
      if (!payload.success) {
        throw new BadRequestException({
          code: AUTH_ERROR_CODES.CAPTCHA_INVALID,
          message: 'El token CAPTCHA es inválido o expiró.',
        });
      }
      return;
    }

    const normalized = trimmed.toLowerCase();
    if (normalized === 'invalid-captcha' || normalized === 'fail' || normalized.length < 4) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.CAPTCHA_INVALID,
        message: 'El token CAPTCHA es inválido o expiró.',
      });
    }
  }
}
