import type {
  AppRole,
  AuditLogEntryView,
  AuthSessionResponse,
  AuthUserView,
  PaginatedResponse,
  RegisterResponse,
  TotpSetupResponse,
} from '@apuestas/shared';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
);

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

function formatServerMessage(payload: ErrorBody | null, fallbackStatus: number): string {
  if (payload && Array.isArray(payload.message)) {
    const parts = payload.message.filter((item): item is string => typeof item === 'string');
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  if (payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return `La solicitud falló con estado HTTP ${String(fallbackStatus)}.`;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  let parsedBody: unknown = null;
  try {
    parsedBody = await response.json();
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    const errorPayload =
      typeof parsedBody === 'object' && parsedBody !== null ? (parsedBody as ErrorBody) : null;
    const code = typeof errorPayload?.code === 'string' ? errorPayload.code : undefined;
    const message = formatServerMessage(errorPayload, response.status);
    throw new ApiClientError(response.status, message, code);
  }

  return parsedBody as T;
}

export interface RegisterRequestPayload {
  email: string;
  password: string;
  isAdultConfirmed: boolean;
  captchaToken: string;
}

export interface LoginRequestPayload {
  email: string;
  password: string;
  captchaToken: string;
  totpCode?: string;
}

export function registerAccount(payload: RegisterRequestPayload): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function verifyEmailToken(token: string): Promise<{ verified: true; user: AuthUserView }> {
  return apiFetch<{ verified: true; user: AuthUserView }>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function loginAccount(payload: LoginRequestPayload): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function refreshSession(): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/auth/refresh', {
    method: 'POST',
  });
}

export function logoutAccount(): Promise<{ loggedOut: true }> {
  return apiFetch<{ loggedOut: true }>('/auth/logout', {
    method: 'POST',
  });
}

export function fetchCurrentUser(): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/auth/me', {
    method: 'GET',
  });
}

export function setupTotp(): Promise<TotpSetupResponse> {
  return apiFetch<TotpSetupResponse>('/auth/2fa/setup', {
    method: 'POST',
  });
}

export function enableTotp(code: string): Promise<{ enabled: true; user: AuthUserView }> {
  return apiFetch<{ enabled: true; user: AuthUserView }>('/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function fetchAdminUsers(page = 1, pageSize = 20): Promise<PaginatedResponse<AuthUserView>> {
  return apiFetch<PaginatedResponse<AuthUserView>>(
    `/admin/users?page=${String(page)}&pageSize=${String(pageSize)}`,
    { method: 'GET' },
  );
}

export function updateAdminUserRole(userId: string, role: AppRole): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function fetchAdminAuditLogs(
  page = 1,
  pageSize = 20,
  action?: string,
): Promise<PaginatedResponse<AuditLogEntryView>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (action && action.trim()) {
    params.set('action', action.trim());
  }
  return apiFetch<PaginatedResponse<AuditLogEntryView>>(`/admin/audit-logs?${params.toString()}`, {
    method: 'GET',
  });
}
