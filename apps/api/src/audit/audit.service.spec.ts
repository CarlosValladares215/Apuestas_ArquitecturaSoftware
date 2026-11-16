import { InMemoryAuditLogRepository } from './in-memory-audit-log.repository';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('appends immutable entries with newest-first ordering and pagination', async () => {
    const repo = new InMemoryAuditLogRepository();
    const auditService = new AuditService(repo);

    const metadata = {
      ipOrigin: 'edge',
      password: 'should-never-be-stored',
      nested: { refreshToken: 'secret-token', note: 'safe-value' },
    };

    await auditService.record({
      actorUserId: 'user-1',
      action: 'AUTH_REGISTER',
      targetType: 'User',
      targetId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'JestAgent/1.0',
      deviceFingerprint: 'fp-123',
      metadata,
    });

    metadata.ipOrigin = 'tampered-after-write';

    await auditService.record({
      actorUserId: 'user-1',
      action: 'AUTH_LOGIN_SUCCESS',
      targetType: 'User',
      targetId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'JestAgent/1.0',
    });

    const page = await auditService.list({ actorUserId: 'user-1', page: 1, pageSize: 10 });

    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.action).toBe('AUTH_LOGIN_SUCCESS');
    expect(page.items[1]?.action).toBe('AUTH_REGISTER');
    expect(page.items[1]?.metadata).toEqual({
      ipOrigin: 'edge',
      nested: { note: 'safe-value' },
    });
  });

  it('filters by action and clamps invalid pagination bounds', async () => {
    const repo = new InMemoryAuditLogRepository();
    const auditService = new AuditService(repo);

    await auditService.record({ actorUserId: 'u1', action: 'AUTH_REGISTER' });
    await auditService.record({ actorUserId: 'u1', action: 'AUTH_LOCKED' });

    const filtered = await auditService.list({
      action: 'AUTH_LOCKED',
      page: 0,
      pageSize: 500,
    });

    expect(filtered.page).toBe(1);
    expect(filtered.pageSize).toBe(100);
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.action).toBe('AUTH_LOCKED');
  });
});
