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

export const MATCH_STATUSES = [
  'programado',
  'en_vivo',
  'finalizado',
  'suspendido',
  'aplazado',
  'cancelado',
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MARKET_STATUSES = ['open', 'closed', 'suspended'] as const;

export type MarketStatus = (typeof MARKET_STATUSES)[number];

export type MarketClosedReason = 'match_started' | 'match_status_changed' | 'manual_operator';

export interface Competition {
  id: string;
  name: string;
  country: string;
  sport: string;
  externalId?: number;
}

export interface MatchScore {
  home: number;
  away: number;
}

export interface MarketSelection {
  id: string;
  marketId: string;
  key: string;
  label: string;
  odds: number;
}

export interface BettingMarket {
  id: string;
  matchId: string;
  type: string;
  name: string;
  isPreMatch: boolean;
  status: MarketStatus;
  closedReason: MarketClosedReason | null;
  selections: MarketSelection[];
}

export interface MatchWithMarkets {
  id: string;
  competitionId: string;
  competition: Competition;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  status: MatchStatus;
  score: MatchScore;
  elapsedMinute: number | null;
  externalId?: number;
  markets: BettingMarket[];
  updatedAt: string;
}

export type SyncQuotaPurpose = 'live' | 'scheduled';

export type ApiFootballSyncMode =
  'live_active' | 'scheduled_only' | 'reserve_protected' | 'budget_exhausted';

export type ApiFootballSyncOutcome = 'updated' | 'skipped_budget' | 'skipped_reserve' | 'idle';

export interface ApiFootballSyncStatus {
  dateUtc: string;
  dailyBudget: number;
  liveReserve: number;
  usedToday: number;
  remainingToday: number;
  activeLiveMatches: number;
  mode: ApiFootballSyncMode;
  recommendedIntervalMs: number | null;
  apiKeyConfigured: boolean;
  lastSyncAt: string | null;
  lastSyncOutcome: ApiFootballSyncOutcome;
}

export interface MatchAuditEntry {
  id: string;
  timestamp: string;
  actorRole: AppRole;
  action:
    | 'MATCH_CREATED'
    | 'MATCH_STATUS_CHANGED'
    | 'MARKET_CREATED'
    | 'ODDS_UPDATED'
    | 'API_FOOTBALL_SYNC';
  matchId: string;
  details: string;
}

export const MATCH_STATE_TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  programado: ['en_vivo', 'suspendido', 'aplazado', 'cancelado'],
  en_vivo: ['finalizado', 'suspendido', 'aplazado', 'cancelado'],
  suspendido: ['en_vivo', 'aplazado', 'cancelado'],
  aplazado: ['programado', 'en_vivo', 'cancelado'],
  finalizado: [],
  cancelado: [],
};

export const LIVE_SYNC_INTERVAL_MS = 60_000;
export const SCHEDULED_SYNC_INTERVAL_MS = 1_800_000;
export const RESERVE_PROTECTED_SYNC_INTERVAL_MS = 21_600_000;

/**
 * Checks whether a value corresponds to a recognized platform role.
 */
export function isValidAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Checks whether a value is a recognized match status.
 */
export function isValidMatchStatus(value: string): value is MatchStatus {
  return (MATCH_STATUSES as readonly string[]).includes(value);
}

/**
 * Validates whether a match status transition is permitted by the domain state machine.
 */
export function canTransitionMatchStatus(from: MatchStatus, to: MatchStatus): boolean {
  return MATCH_STATE_TRANSITIONS[from].includes(to);
}

/**
 * Determines whether a pre-match market must be automatically closed based on the server clock
 * or current match status.
 */
export function shouldAutoClosePreMatchMarket(
  match: Pick<MatchWithMarkets, 'status' | 'kickoffAt'>,
  market: Pick<BettingMarket, 'isPreMatch' | 'status'>,
  serverNow: Date,
): boolean {
  if (!market.isPreMatch) {
    return false;
  }

  if (match.status !== 'programado') {
    return true;
  }

  const kickoffMs = Date.parse(match.kickoffAt);
  return serverNow.getTime() >= kickoffMs;
}

/**
 * Evaluates whether a market is effectively open for pre-match betting according to the server clock.
 */
export function isPreMatchMarketOpen(
  match: Pick<MatchWithMarkets, 'status' | 'kickoffAt'>,
  market: Pick<BettingMarket, 'isPreMatch' | 'status'>,
  serverNow: Date,
): boolean {
  if (market.status !== 'open') {
    return false;
  }

  if (shouldAutoClosePreMatchMarket(match, market, serverNow)) {
    return false;
  }

  return true;
}

/**
 * Checks whether the API-Football worker can consume a request from the daily budget
 * while respecting the reserved quota for live matches.
 */
export function canConsumeApiFootballQuota(
  quota: { dailyBudget: number; liveReserve: number; usedToday: number },
  purpose: SyncQuotaPurpose,
): boolean {
  const remaining = Math.max(0, quota.dailyBudget - quota.usedToday);
  if (remaining <= 0) {
    return false;
  }

  if (purpose === 'live') {
    return true;
  }

  return remaining > quota.liveReserve;
}

/**
 * Calculates the adaptive polling interval in milliseconds for API-Football synchronization.
 * Returns null if the daily budget is exhausted.
 */
export function calculateAdaptiveSyncIntervalMs(params: {
  activeLiveMatches: number;
  dailyBudget: number;
  liveReserve: number;
  usedToday: number;
}): number | null {
  const remaining = Math.max(0, params.dailyBudget - params.usedToday);
  if (remaining <= 0) {
    return null;
  }

  if (params.activeLiveMatches > 0) {
    return LIVE_SYNC_INTERVAL_MS;
  }

  if (remaining <= params.liveReserve) {
    return RESERVE_PROTECTED_SYNC_INTERVAL_MS;
  }

  return SCHEDULED_SYNC_INTERVAL_MS;
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
  sandboxVerificationUrl?: string;
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

/* ========================================================================== */
/* LEDGER & WALLET CONTRACTS (Phase F2: Specs 003 & 004)                     */
/* ========================================================================== */

export const ACCOUNT_TYPES = ['user_real', 'user_bonus', 'house', 'gateway'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LEDGER_ENTRY_TYPES = ['DEBIT', 'CREDIT'] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const TRANSACTION_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'BET_STAKE',
  'BET_PAYOUT',
  'BONUS_GRANT',
  'COMPENSATION',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_INTENT_STATUSES = ['PENDING', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export interface LedgerAccount {
  id: string;
  code: string;
  type: AccountType;
  userId?: string | null;
  currency: 'USD';
  createdAt: string;
}

export interface LedgerTransaction {
  id: string;
  referenceCode: string;
  type: TransactionType;
  description: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  entryType: LedgerEntryType;
  amount: number; // Stored in cents (integer) to avoid float precision bugs
  createdAt: string;
}

export interface WalletBalance {
  userId: string;
  realBalance: number; // In dollars (decimal format for client presentation)
  bonusBalance: number; // In dollars
  totalBalance: number; // In dollars
  currency: 'USD';
  updatedAt: string;
}

export interface WalletMovementDto {
  id: string;
  transactionId: string;
  referenceCode: string;
  type: TransactionType;
  accountType: AccountType;
  entryType: LedgerEntryType;
  amount: number; // In dollars
  description: string;
  createdAt: string;
}

export interface CreateDepositIntentDto {
  userId: string;
  amount: number; // In dollars (e.g. 25.00)
  currency: 'USD';
}

export interface DepositIntentResponseDto {
  intentId: string;
  clientTransactionId: string;
  amount: number; // In dollars
  currency: 'USD';
  status: PaymentIntentStatus;
  payphoneUrl: string;
}

export interface ConfirmDepositDto {
  clientTransactionId: string;
  payphoneTransactionId: string;
}

export interface ConfirmDepositResponseDto {
  success: boolean;
  status: PaymentIntentStatus;
  clientTransactionId: string;
  creditedAmount: number; // In dollars
  currency: 'USD';
  newRealBalance: number; // In dollars
}

export interface DebitWalletDto {
  userId: string;
  amount: number; // In dollars
  referenceCode: string;
  description: string;
  accountType?: 'user_real' | 'user_bonus';
}

export interface DebitWalletResponseDto {
  success: boolean;
  transactionId: string;
  debitedAmount: number; // In dollars
  remainingBalance: number; // In dollars
}

/* ========================================================================== */
/* PURE FINANCIAL HELPERS                                                     */
/* ========================================================================== */

/**
 * Converts a dollar amount (e.g. 10.55) to integer cents (1055), preventing floating-point drift.
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Converts integer cents (e.g. 1055) to dollars (10.55).
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Validates the fundamental double-entry rule:
 * Sum(Debits) === Sum(Credits) and all amounts > 0.
 */
export function validateBalancedTransaction(
  entries: ReadonlyArray<{ entryType: LedgerEntryType; amount: number }>,
): boolean {
  if (entries.length < 2) {
    return false;
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const entry of entries) {
    if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
      return false;
    }
    if (entry.entryType === 'DEBIT') {
      totalDebits += entry.amount;
    } else {
      totalCredits += entry.amount;
    }
  }

  return totalDebits === totalCredits;
}

/**
 * Calculates user account balance from entries in cents:
 * Credits add to balance; Debits reduce balance.
 */
export function deriveBalanceFromEntries(
  entries: ReadonlyArray<{ entryType: LedgerEntryType; amount: number }>,
): number {
  return entries.reduce((acc, entry) => {
    return entry.entryType === 'CREDIT' ? acc + entry.amount : acc - entry.amount;
  }, 0);
}
