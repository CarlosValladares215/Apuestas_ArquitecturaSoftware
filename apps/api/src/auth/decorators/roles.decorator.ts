import { SetMetadata } from '@nestjs/common';
import { AppRole } from '@apuestas/shared';

export const ROLES_KEY = 'roles';

/**
 * Restricts a protected route or controller to one of the specified constitutional roles.
 */
export const Roles = (...roles: AppRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
