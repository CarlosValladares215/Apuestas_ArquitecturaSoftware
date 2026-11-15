import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as OTPAuth from 'otpauth';

const TOTP_ISSUER = 'ApuestasDeportivasUTPL';
const PLACEHOLDER_KEY = 'replace_with_64_hex_chars_32_bytes_aes_256_gcm_key';
const TEST_FALLBACK_SEED = 'test-only-totp-aes-256-gcm-key-apuestas-spec-002';

export interface TotpEnrollmentPayload {
  base32Secret: string;
  encryptedSecret: string;
  otpauthUri: string;
}

@Injectable()
export class TotpService {
  constructor(@Optional() private readonly config?: ConfigService) {}

  /**
   * Generates a new TOTP secret, encrypted at-rest blob, and otpauth:// enrollment URI.
   */
  generateEnrollment(email: string): TotpEnrollmentPayload {
    const secret = new OTPAuth.Secret({ size: 20 });
    const base32Secret = secret.base32;
    const encryptedSecret = this.encryptSecret(base32Secret);

    const totp = new OTPAuth.TOTP({
      issuer: TOTP_ISSUER,
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    return {
      base32Secret,
      encryptedSecret,
      otpauthUri: totp.toString(),
    };
  }

  /**
   * Encrypts a base32 TOTP secret with AES-256-GCM.
   */
  encryptSecret(base32Secret: string): string {
    const key = this.resolveEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(base32Secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  /**
   * Decrypts a previously encrypted v1 AES-256-GCM TOTP secret blob.
   */
  decryptSecret(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Malformed encrypted TOTP payload.');
    }

    const [, ivB64, tagB64, dataB64] = parts;
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Incomplete encrypted TOTP payload.');
    }

    const key = this.resolveEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(dataB64, 'base64');

    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
      throw new Error('Invalid AES-256-GCM parameter lengths.');
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /**
   * Verifies a 6-digit RFC 6238 code against an encrypted secret payload.
   */
  verifyEncryptedCode(encryptedPayload: string, code: string, window = 1): boolean {
    if (!/^\d{6}$/.test(code)) {
      return false;
    }

    try {
      const base32Secret = this.decryptSecret(encryptedPayload);
      const totp = new OTPAuth.TOTP({
        issuer: TOTP_ISSUER,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(base32Secret),
      });

      return totp.validate({ token: code, window }) !== null;
    } catch {
      return false;
    }
  }

  private resolveEncryptionKey(): Buffer {
    const configured = (
      this.config?.get<string>('TOTP_ENCRYPTION_KEY') ??
      process.env.TOTP_ENCRYPTION_KEY ??
      ''
    ).trim();

    if (/^[0-9a-fA-F]{64}$/.test(configured)) {
      return Buffer.from(configured, 'hex');
    }

    if (configured && configured !== PLACEHOLDER_KEY && configured.length >= 16) {
      return createHash('sha256').update(configured, 'utf8').digest();
    }

    const nodeEnv = this.config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
    if (nodeEnv === 'test') {
      return createHash('sha256').update(TEST_FALLBACK_SEED, 'utf8').digest();
    }

    throw new Error('TOTP_ENCRYPTION_KEY must be set to a strong key outside test mode.');
  }
}
