import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppRole } from '@apuestas/shared';
import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: AppRole;
  totpEnabled: boolean;
}

export interface RequestWithAuthUser extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    return request.user;
  },
);
