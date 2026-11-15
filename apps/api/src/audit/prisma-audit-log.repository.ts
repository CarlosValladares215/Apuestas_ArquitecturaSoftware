import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogEntryView, PaginatedResponse } from '@apuestas/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogRepository, AuditQueryFilter, AuditRecordInput } from './audit-log.repository';

function toRecordOrNull(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = item;
  }
  return result;
}

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditRecordInput): Promise<AuditLogEntryView> {
    const created = await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        deviceFingerprint: entry.deviceFingerprint ?? null,
        metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    return {
      id: created.id,
      actorUserId: created.actorUserId,
      action: created.action,
      targetType: created.targetType,
      targetId: created.targetId,
      ipAddress: created.ipAddress,
      userAgent: created.userAgent,
      deviceFingerprint: created.deviceFingerprint,
      metadata: toRecordOrNull(created.metadata),
      createdAt: created.createdAt.toISOString(),
    };
  }

  async findPaginated(
    filter: Required<Pick<AuditQueryFilter, 'page' | 'pageSize'>> & AuditQueryFilter,
  ): Promise<PaginatedResponse<AuditLogEntryView>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
      ...(filter.action ? { action: filter.action } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        deviceFingerprint: row.deviceFingerprint,
        metadata: toRecordOrNull(row.metadata),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}
