import type { Request } from 'express';

export interface ClientRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
}

export function extractRequestContext(req: Request): ClientRequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.trim()
        : undefined;

  const ipAddress = firstForwarded || req.ip || null;
  const userAgentHeader = req.headers['user-agent'];
  const userAgent = typeof userAgentHeader === 'string' ? userAgentHeader : null;
  const fpHeader = req.headers['x-device-fingerprint'];
  const deviceFingerprint =
    typeof fpHeader === 'string' && fpHeader.trim() ? fpHeader.trim() : null;

  return {
    ipAddress,
    userAgent,
    deviceFingerprint,
  };
}

export function readRequestCookie(req: Request, cookieName: string): string | undefined {
  const maybeCookies: unknown = Reflect.get(req, 'cookies');
  if (maybeCookies !== null && typeof maybeCookies === 'object' && !Array.isArray(maybeCookies)) {
    const value: unknown = Reflect.get(maybeCookies, cookieName);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}
