export const APP_VERSION = '0.1.0';

export const APP_ROLES = ['bettor', 'operator', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type ServiceName = 'api' | 'reports' | 'web';

export type HealthState = 'ok' | 'degraded';

export interface HealthStatus {
  status: HealthState;
  service: ServiceName;
  version: string;
  timestamp: string;
}

/**
 * Checks whether a value corresponds to a recognized platform role.
 */
export function isValidAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Builds a standardized health payload shared across services.
 */
export function createHealthStatus(
  service: ServiceName,
  status: HealthState = 'ok',
  now: Date = new Date(),
): HealthStatus {
  return {
    status,
    service,
    version: APP_VERSION,
    timestamp: now.toISOString(),
  };
}

export const PASSWORD_MIN_LENGTH = 10;

export const AUDIT_ACTIONS = [
  'AUTH_REGISTER',
  'AUTH_EMAIL_VERIFIED',
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOCKED',
  'AUTH_REFRESH',
  'AUTH_REFRESH_REUSE_DETECTED',
  'AUTH_LOGOUT',
  'AUTH_2FA_SETUP_STARTED',
  'AUTH_2FA_ENABLED',
  'USER_ROLE_CHANGED',
] as const;

export type Spec002AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditAction = Spec002AuditAction | (string & {});

export const AUTH_ERROR_CODES = {
  ADULT_CONFIRMATION_REQUIRED: 'ADULT_CONFIRMATION_REQUIRED',
  CAPTCHA_INVALID: 'CAPTCHA_INVALID',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOTP_REQUIRED: 'TOTP_REQUIRED',
  TOTP_INVALID: 'TOTP_INVALID',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOKEN_INVALID_OR_EXPIRED: 'TOKEN_INVALID_OR_EXPIRED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  SELF_ROLE_CHANGE_FORBIDDEN: 'SELF_ROLE_CHANGE_FORBIDDEN',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export interface AuthUserView {
  id: string;
  email: string;
  role: AppRole;
  emailVerified: boolean;
  totpEnabled: boolean;
  adultConfirmedAt: string;
  createdAt: string;
}

export interface AuditLogEntryView {
  id: string;
  actorUserId: string | null;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RegisterResponse {
  user: AuthUserView;
  verificationRequired: true;
  message: string;
}

export interface AuthSessionResponse {
  user: AuthUserView;
}

export interface TotpSetupResponse {
  secret: string;
  otpauthUri: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Checks whether an action string belongs to the canonical Spec 002 audit taxonomy.
 */
export function isAuditAction(value: string): value is Spec002AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

/**
 * Normalizes an email address using trim and lowercase so comparisons stay canonical.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validates FR-001 password policy: minimum length 10 with upper, lower, and numeric digit.
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`La contraseña debe tener al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('La contraseña debe incluir al menos una letra mayúscula.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('La contraseña debe incluir al menos una letra minúscula.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('La contraseña debe incluir al menos un dígito numérico.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
