import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogEntryView, PaginatedResponse } from '@apuestas/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('admin/audit-logs')
@Roles('admin')
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  listAuditLogs(@Query() query: AuditQueryDto): Promise<PaginatedResponse<AuditLogEntryView>> {
    return this.auditService.list({
      actorUserId: query.actorUserId,
      action: query.action,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
