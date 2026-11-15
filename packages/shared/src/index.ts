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
