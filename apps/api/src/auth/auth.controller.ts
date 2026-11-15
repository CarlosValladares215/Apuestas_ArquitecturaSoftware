import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthSessionResponse, RegisterResponse, TotpSetupResponse } from '@apuestas/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from './auth.constants';
import { AuthService, IssuedSessionTokens } from './auth.service';
import { AuthenticatedUser, CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { EnableTotpDto, LoginDto, RegisterDto, VerifyEmailDto } from './dto/auth.dto';
import { extractRequestContext, readRequestCookie } from './request-context';

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

function attachSessionCookies(res: Response, tokens: IssuedSessionTokens): void {
  const shared = baseCookieOptions();

  res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, {
    ...shared,
    path: '/',
    maxAge: tokens.accessMaxAgeMs,
  });

  res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
    ...shared,
    path: '/auth',
    maxAge: tokens.refreshMaxAgeMs,
  });
}

function clearSessionCookies(res: Response): void {
  const shared = baseCookieOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { ...shared, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { ...shared, path: '/auth' });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<RegisterResponse> {
    return this.authService.register(dto, extractRequestContext(req));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
  ): Promise<{ verified: true; user: AuthSessionResponse['user'] }> {
    return this.authService.verifyEmail(dto.token, extractRequestContext(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.login(dto, extractRequestContext(req));
    attachSessionCookies(res, result.tokens);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const rawRefreshToken = readRequestCookie(req, REFRESH_TOKEN_COOKIE_NAME);
    try {
      const result = await this.authService.refresh(rawRefreshToken, extractRequestContext(req));
      attachSessionCookies(res, result.tokens);
      return { user: result.user };
    } catch (error) {
      clearSessionCookies(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ): Promise<{ loggedOut: true }> {
    const rawRefreshToken = readRequestCookie(req, REFRESH_TOKEN_COOKIE_NAME);
    await this.authService.logout(
      rawRefreshToken,
      currentUser?.userId ?? null,
      extractRequestContext(req),
    );
    clearSessionCookies(res);
    return { loggedOut: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthSessionResponse> {
    return this.authService.getProfile(user.userId);
  }

  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  setupTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<TotpSetupResponse> {
    return this.authService.setupTotp(user.userId, extractRequestContext(req));
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  enableTotp(
    @Body() dto: EnableTotpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ enabled: true; user: AuthSessionResponse['user'] }> {
    return this.authService.enableTotp(user.userId, dto.code, extractRequestContext(req));
  }
}
