import { Inject, Injectable } from '@nestjs/common';
import { AuditLogEntryView, PaginatedResponse } from '@apuestas/shared';
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogRepository,
  AuditQueryFilter,
  AuditRecordInput,
} from './audit-log.repository';

const SENSITIVE_KEY_PATTERN =
  /^(password|passwordhash|secret|token|totpsecret|totpsecretencrypted|refreshtoken|accesstoken|authorization|cookie)$/i;

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === 'object' && value !== null) {
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!SENSITIVE_KEY_PATTERN.test(key)) {
        clean[key] = sanitizeValue(item);
      }
    }
    return clean;
  }
  return value;
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }
  return sanitizeValue(metadata) as Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repository: AuditLogRepository,
  ) {}

  /**
   * Appends an immutable audit entry after stripping accidental secret fields from metadata.
   */
  async record(input: AuditRecordInput): Promise<AuditLogEntryView> {
    return this.repository.append({
      ...input,
      metadata: sanitizeMetadata(input.metadata),
    });
  }

  /**
   * Lists audit events ordered newest-first with bounded pagination.
   */
  async list(filter: AuditQueryFilter = {}): Promise<PaginatedResponse<AuditLogEntryView>> {
    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(filter.pageSize ?? 20)));

    return this.repository.findPaginated({
      ...filter,
      page,
      pageSize,
    });
  }
}
