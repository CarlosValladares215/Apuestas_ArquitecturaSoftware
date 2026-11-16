import { AuditAction, AuditLogEntryView, PaginatedResponse } from '@apuestas/shared';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export interface AuditRecordInput {
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditQueryFilter {
  actorUserId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Append-only audit persistence contract. By design, no update or delete methods exist.
 */
export interface AuditLogRepository {
  append(entry: AuditRecordInput): Promise<AuditLogEntryView>;
  findPaginated(
    filter: Required<Pick<AuditQueryFilter, 'page' | 'pageSize'>> & AuditQueryFilter,
  ): Promise<PaginatedResponse<AuditLogEntryView>>;
}
