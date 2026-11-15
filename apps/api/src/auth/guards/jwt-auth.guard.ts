import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AUTH_ERROR_CODES } from '@apuestas/shared';
import { USER_REPOSITORY, UserRepository } from '../../users/user.repository';
import { ACCESS_TOKEN_COOKIE_NAME, resolveJwtAccessSecret } from '../auth.constants';
import { RequestWithAuthUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { readRequestCookie } from '../request-context';

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
}

function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) {
    return token.trim();
  }
  return undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    const token =
      readRequestCookie(request, ACCESS_TOKEN_COOKIE_NAME) ??
      extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'Debes iniciar sesión para acceder a este recurso.',
      });
    }

    let payload: Partial<JwtAccessPayload>;
    try {
      payload = await this.jwtService.verifyAsync<Partial<JwtAccessPayload>>(token, {
        secret: resolveJwtAccessSecret(this.config),
      });
    } catch {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'Tu sesión expiró o es inválida.',
      });
    }

    if (payload.type !== 'access' || typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'Token de acceso inválido.',
      });
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user || (user.lockedUntil && user.lockedUntil.getTime() > Date.now())) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'La cuenta no está activa o se encuentra bloqueada.',
      });
    }

    request.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      totpEnabled: user.totpEnabled,
    };
    return true;
  }
}
