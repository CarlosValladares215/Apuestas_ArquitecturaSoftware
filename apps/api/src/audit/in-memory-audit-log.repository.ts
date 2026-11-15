import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditLogEntryView, PaginatedResponse } from '@apuestas/shared';
import { AuditLogRepository, AuditQueryFilter, AuditRecordInput } from './audit-log.repository';

function cloneEntry(entry: AuditLogEntryView): AuditLogEntryView {
  return {
    ...entry,
    metadata: entry.metadata
      ? (JSON.parse(JSON.stringify(entry.metadata)) as Record<string, unknown>)
      : null,
  };
}

@Injectable()
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly entries: AuditLogEntryView[] = [];

  append(entry: AuditRecordInput): Promise<AuditLogEntryView> {
    const stored: AuditLogEntryView = {
      id: randomUUID(),
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      deviceFingerprint: entry.deviceFingerprint ?? null,
      metadata: entry.metadata
        ? (JSON.parse(JSON.stringify(entry.metadata)) as Record<string, unknown>)
        : null,
      createdAt: new Date().toISOString(),
    };

    this.entries.unshift(stored);
    return Promise.resolve(cloneEntry(stored));
  }

  findPaginated(
    filter: Required<Pick<AuditQueryFilter, 'page' | 'pageSize'>> & AuditQueryFilter,
  ): Promise<PaginatedResponse<AuditLogEntryView>> {
    const filtered = this.entries.filter((item) => {
      if (filter.actorUserId && item.actorUserId !== filter.actorUserId) {
        return false;
      }
      if (filter.action && item.action !== filter.action) {
        return false;
      }
      return true;
    });

    const offset = (filter.page - 1) * filter.pageSize;
    const items = filtered.slice(offset, offset + filter.pageSize).map(cloneEntry);

    return Promise.resolve({
      items,
      total: filtered.length,
      page: filter.page,
      pageSize: filter.pageSize,
    });
  }
}
