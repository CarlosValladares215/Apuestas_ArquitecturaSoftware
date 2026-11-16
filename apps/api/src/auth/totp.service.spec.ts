import { ConfigService } from '@nestjs/config';
import * as OTPAuth from 'otpauth';
import { TotpService } from './totp.service';

describe('TotpService', () => {
  const config = new ConfigService({
    NODE_ENV: 'test',
    TOTP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });
  const totpService = new TotpService(config);

  it('generates an otpauth URI and encrypts the TOTP secret with AES-256-GCM', () => {
    const enrollment = totpService.generateEnrollment('bettor@utpl.edu.ec');

    expect(enrollment.base32Secret.length).toBeGreaterThanOrEqual(16);
    expect(enrollment.otpauthUri).toContain('otpauth://totp/');
    expect(enrollment.otpauthUri).toContain(encodeURIComponent('bettor@utpl.edu.ec'));
    expect(enrollment.encryptedSecret.startsWith('v1:')).toBe(true);
    expect(enrollment.encryptedSecret).not.toContain(enrollment.base32Secret);
    expect(totpService.decryptSecret(enrollment.encryptedSecret)).toBe(enrollment.base32Secret);
  });

  it('verifies a valid 6-digit TOTP code against the encrypted secret and rejects wrong codes', () => {
    const enrollment = totpService.generateEnrollment('operator@utpl.edu.ec');
    const validToken = new OTPAuth.TOTP({
      issuer: 'ApuestasDeportivasUTPL',
      label: 'operator@utpl.edu.ec',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(enrollment.base32Secret),
    }).generate();

    expect(totpService.verifyEncryptedCode(enrollment.encryptedSecret, validToken)).toBe(true);
    expect(totpService.verifyEncryptedCode(enrollment.encryptedSecret, '000000')).toBe(false);
    expect(totpService.verifyEncryptedCode(enrollment.encryptedSecret, 'abc123')).toBe(false);
  });

  it('rejects tampered ciphertext blobs cleanly', () => {
    const enrollment = totpService.generateEnrollment('tamper@utpl.edu.ec');
    const parts = enrollment.encryptedSecret.split(':');
    const tampered = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '', 'AAAA'].join(':');

    expect(() => totpService.decryptSecret(tampered)).toThrow();
    expect(totpService.verifyEncryptedCode(tampered, '123456')).toBe(false);
  });
});
