import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES, AppRole } from '@apuestas/shared';
import { RequestWithAuthUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    if (!request.user) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'Debes iniciar sesión para acceder a este recurso.',
      });
    }

    const requiredRoles = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.FORBIDDEN_ROLE,
        message: 'No tienes permisos suficientes para realizar esta acción.',
      });
    }

    return true;
  }
}
