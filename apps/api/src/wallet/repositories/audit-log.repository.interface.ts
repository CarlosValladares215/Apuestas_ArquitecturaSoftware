export const AUDIT_LOG_REPOSITORY = 'AUDIT_LOG_REPOSITORY';

export interface AuditLogRecord {
  id: string;
  userId?: string | null;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt: string;
}

export interface IAuditLogRepository {
  record(log: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<AuditLogRecord>;
  findByUser(userId: string): Promise<AuditLogRecord[]>;
}
