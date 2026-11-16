import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  AUTH_ERROR_CODES,
  AuthSessionResponse,
  AuthUserView,
  PaginatedResponse,
} from '@apuestas/shared';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { extractRequestContext } from '../auth/request-context';
import { PaginationQueryDto, UpdateUserRoleDto } from './dto/users.dto';
import { USER_REPOSITORY, UserRepository, toAuthUserView } from './user.repository';

@Controller('admin/users')
@Roles('admin')
export class AdminUsersController {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async listUsers(@Query() query: PaginationQueryDto): Promise<PaginatedResponse<AuthUserView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.userRepository.findPaginated(page, pageSize);

    return {
      items: result.items.map(toAuthUserView),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @Patch(':id/role')
  async updateUserRole(
    @Param('id') targetUserId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<AuthSessionResponse> {
    if (actor.userId === targetUserId) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.SELF_ROLE_CHANGE_FORBIDDEN,
        message: 'Un administrador no puede modificar su propio rol.',
      });
    }

    const target = await this.userRepository.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (target.role === 'admin' && dto.role !== 'admin') {
      const adminCount = await this.userRepository.countAdmins();
      if (adminCount <= 1) {
        throw new BadRequestException({
          code: AUTH_ERROR_CODES.SELF_ROLE_CHANGE_FORBIDDEN,
          message: 'Debe existir al menos un administrador activo en la plataforma.',
        });
      }
    }

    const updated = await this.userRepository.updateRole(targetUserId, dto.role);
    const ctx = extractRequestContext(req);

    await this.auditService.record({
      actorUserId: actor.userId,
      action: 'USER_ROLE_CHANGED',
      targetType: 'User',
      targetId: updated.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
      metadata: {
        previousRole: target.role,
        nextRole: updated.role,
      },
    });

    return {
      user: toAuthUserView(updated),
    };
  }
}
