import {
  APP_ROLES,
  APP_VERSION,
  AUDIT_ACTIONS,
  AUTH_ERROR_CODES,
  PASSWORD_MIN_LENGTH,
  createHealthStatus,
  isAuditAction,
  isValidAppRole,
  normalizeEmail,
  validatePasswordStrength,
} from '../src/index';

describe('shared contracts', () => {
  it('exposes the three constitutional platform roles', () => {
    expect(APP_ROLES).toEqual(['bettor', 'operator', 'admin']);
    expect(isValidAppRole('bettor')).toBe(true);
    expect(isValidAppRole('superadmin')).toBe(false);
  });

  it('creates a valid HealthStatus payload with ISO timestamp', () => {
    const fixedDate = new Date('2026-11-14T21:00:00.000Z');
    const payload = createHealthStatus('api', 'ok', fixedDate);

    expect(payload).toEqual({
      status: 'ok',
      service: 'api',
      version: APP_VERSION,
      timestamp: '2026-11-14T21:00:00.000Z',
    });
  });

  it('exposes canonical Spec 002 audit actions and error codes', () => {
    expect(AUDIT_ACTIONS).toContain('AUTH_REGISTER');
    expect(AUDIT_ACTIONS).toContain('AUTH_REFRESH_REUSE_DETECTED');
    expect(AUDIT_ACTIONS).toContain('USER_ROLE_CHANGED');
    expect(isAuditAction('AUTH_LOGIN_SUCCESS')).toBe(true);
    expect(isAuditAction('NON_EXISTENT_ACTION')).toBe(false);
    expect(AUTH_ERROR_CODES.ADULT_CONFIRMATION_REQUIRED).toBe('ADULT_CONFIRMATION_REQUIRED');
    expect(AUTH_ERROR_CODES.REFRESH_TOKEN_REUSED).toBe('REFRESH_TOKEN_REUSED');
  });

  it('normalizes email addresses and enforces FR-001 password policy', () => {
    expect(normalizeEmail('  User.Name+Test@Example.COM  ')).toBe('user.name+test@example.com');
    expect(PASSWORD_MIN_LENGTH).toBe(10);

    expect(validatePasswordStrength('Short1A')).toEqual({
      valid: false,
      errors: ['La contraseña debe tener al menos 10 caracteres.'],
    });
    expect(validatePasswordStrength('alllowercase12')).toEqual({
      valid: false,
      errors: ['La contraseña debe incluir al menos una letra mayúscula.'],
    });
    expect(validatePasswordStrength('ALLUPPERCASE12')).toEqual({
      valid: false,
      errors: ['La contraseña debe incluir al menos una letra minúscula.'],
    });
    expect(validatePasswordStrength('NoDigitsHereAtAll')).toEqual({
      valid: false,
      errors: ['La contraseña debe incluir al menos un dígito numérico.'],
    });
    expect(validatePasswordStrength('SeguraPass2026')).toEqual({
      valid: true,
      errors: [],
    });
  });
});
