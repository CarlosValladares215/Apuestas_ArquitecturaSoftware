import { AppRole, isValidAppRole } from '@apuestas/shared';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

export interface RequestWithActorRole extends Request {
  actorRole?: AppRole;
}

/**
 * Enforces RBAC for match and market management endpoints.
 * Denies access by default unless the authenticated context carries 'operator' or 'admin'.
 */
@Injectable()
export class OperatorRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActorRole>();
    const rawHeader = request.headers['x-user-role'];
    const roleCandidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!roleCandidate || !isValidAppRole(roleCandidate)) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere rol operator o admin autenticado.',
      );
    }

    if (roleCandidate !== 'operator' && roleCandidate !== 'admin') {
      throw new ForbiddenException(
        'Acceso denegado: el rol apostador no tiene permisos para gestionar partidos ni mercados.',
      );
    }

    request.actorRole = roleCandidate;
    return true;
  }
}
