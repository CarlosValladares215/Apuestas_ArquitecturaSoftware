import { APP_ROLES, APP_VERSION, createHealthStatus, isValidAppRole } from '../src/index';

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
});
