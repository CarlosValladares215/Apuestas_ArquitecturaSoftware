import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AUTH_ERROR_CODES,
  AuthSessionResponse,
  RegisterResponse,
  TotpSetupResponse,
  normalizeEmail,
  validatePasswordStrength,
} from '@apuestas/shared';
import { AuditService } from '../audit/audit.service';
import {
  USER_REPOSITORY,
  UserRecord,
  UserRepository,
  toAuthUserView,
} from '../users/user.repository';
import {
  ACCOUNT_LOCKOUT_MS,
  EMAIL_VERIFICATION_TTL_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  resolveAccessTtlSeconds,
  resolveJwtAccessSecret,
  resolveRefreshTtlDays,
} from './auth.constants';
import { CaptchaService } from './captcha.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { EmailVerificationNotifier } from './email-verification.notifier';
import { JwtAccessPayload } from './guards/jwt-auth.guard';
import { PasswordService } from './password.service';
import {
  EMAIL_VERIFICATION_REPOSITORY,
  EmailVerificationRepository,
} from './repositories/email-verification.repository';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from './repositories/refresh-token.repository';
import { ClientRequestContext } from './request-context';
import { TokenCryptoService } from './token-crypto.service';
import { TotpService } from './totp.service';

export interface IssuedSessionTokens {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

export interface AuthSessionResult extends AuthSessionResponse {
  tokens: IssuedSessionTokens;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(EMAIL_VERIFICATION_REPOSITORY)
    private readonly verificationRepository: EmailVerificationRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly totpService: TotpService,
    private readonly captchaService: CaptchaService,
    private readonly verificationNotifier: EmailVerificationNotifier,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, ctx: ClientRequestContext): Promise<RegisterResponse> {
    if (!dto.isAdultConfirmed) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.ADULT_CONFIRMATION_REQUIRED,
        message: 'Debes confirmar que eres mayor de 18 años para registrarte.',
      });
    }

    await this.captchaService.assertValid(dto.captchaToken, ctx.ipAddress);

    const passwordCheck = validatePasswordStrength(dto.password);
    if (!passwordCheck.valid) {
      throw new BadRequestException({
        message: passwordCheck.errors,
      });
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        message: 'El correo ya se encuentra registrado.',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const created = await this.userRepository.create({
      email,
      passwordHash,
      role: 'bettor',
      adultConfirmedAt: new Date(),
    });

    const rawVerificationToken = this.tokenCrypto.generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

    await this.verificationRepository.create({
      userId: created.id,
      tokenHash: this.tokenCrypto.sha256Hex(rawVerificationToken),
      expiresAt,
    });

    await this.verificationNotifier.sendVerificationToken({
      userId: created.id,
      email: created.email,
      rawToken: rawVerificationToken,
      expiresAt,
    });

    await this.auditService.record({
      actorUserId: created.id,
      action: 'AUTH_REGISTER',
      targetType: 'User',
      targetId: created.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
      metadata: { role: created.role },
    });

    return {
      user: toAuthUserView(created),
      verificationRequired: true,
      message:
        'Cuenta creada. Revisa tu correo para verificar tu dirección antes de iniciar sesión.',
    };
  }

  async verifyEmail(
    rawToken: string,
    ctx: ClientRequestContext,
  ): Promise<{ verified: true; user: AuthSessionResponse['user'] }> {
    const tokenHash = this.tokenCrypto.sha256Hex(rawToken.trim());
    const record = await this.verificationRepository.findByTokenHash(tokenHash);
    const now = new Date();

    if (!record || record.consumedAt !== null || record.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID_OR_EXPIRED,
        message: 'El enlace de verificación es inválido o expiró.',
      });
    }

    const consumed = await this.verificationRepository.consumeIfUnused(record.id, now);
    if (!consumed) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID_OR_EXPIRED,
        message: 'El token de verificación ya fue utilizado.',
      });
    }

    const verifiedUser = await this.userRepository.markEmailVerified(record.userId, now);

    await this.auditService.record({
      actorUserId: verifiedUser.id,
      action: 'AUTH_EMAIL_VERIFIED',
      targetType: 'User',
      targetId: verifiedUser.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
    });

    return {
      verified: true,
      user: toAuthUserView(verifiedUser),
    };
  }

  async login(dto: LoginDto, ctx: ClientRequestContext): Promise<AuthSessionResult> {
    await this.captchaService.assertValid(dto.captchaToken, ctx.ipAddress);

    const email = normalizeEmail(dto.email);
    const user = await this.userRepository.findByEmail(email);
    const now = new Date();

    if (!user) {
      await this.auditService.record({
        actorUserId: null,
        action: 'AUTH_LOGIN_FAILED',
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        deviceFingerprint: ctx.deviceFingerprint,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'No fue posible iniciar sesión con estas credenciales.',
      });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      await this.auditService.record({
        actorUserId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        targetType: 'User',
        targetId: user.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        deviceFingerprint: ctx.deviceFingerprint,
        metadata: { reason: 'account_locked' },
      });
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        message: 'Acceso restringido temporalmente por intentos fallidos. Intenta más tarde.',
      });
    }

    const passwordMatches = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      await this.recordFailedLoginAttempt(user, now, ctx, 'invalid_password');
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'No fue posible iniciar sesión con estas credenciales.',
      });
    }

    if (!user.emailVerifiedAt) {
      await this.auditService.record({
        actorUserId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        targetType: 'User',
        targetId: user.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        deviceFingerprint: ctx.deviceFingerprint,
        metadata: { reason: 'email_not_verified' },
      });
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        message: 'Debes verificar tu correo electrónico antes de iniciar sesión.',
      });
    }

    if (user.totpEnabled) {
      if (!dto.totpCode) {
        await this.auditService.record({
          actorUserId: user.id,
          action: 'AUTH_LOGIN_FAILED',
          targetType: 'User',
          targetId: user.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          deviceFingerprint: ctx.deviceFingerprint,
          metadata: { reason: 'totp_required' },
        });
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.TOTP_REQUIRED,
          message: 'Ingresa el código TOTP de 6 dígitos de tu autenticador.',
        });
      }

      const totpValid =
        user.totpSecretEncrypted !== null &&
        this.totpService.verifyEncryptedCode(user.totpSecretEncrypted, dto.totpCode);

      if (!totpValid) {
        await this.recordFailedLoginAttempt(user, now, ctx, 'invalid_totp');
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.TOTP_INVALID,
          message: 'El código TOTP de 6 dígitos es inválido.',
        });
      }
    }

    const clearedUser = await this.userRepository.resetLoginFailures(user.id);
    const familyId = randomUUID();
    const tokens = await this.issueSessionTokenPair(clearedUser, familyId, ctx);

    await this.auditService.record({
      actorUserId: clearedUser.id,
      action: 'AUTH_LOGIN_SUCCESS',
      targetType: 'User',
      targetId: clearedUser.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
      metadata: { familyId, totpUsed: clearedUser.totpEnabled },
    });

    return {
      user: toAuthUserView(clearedUser),
      tokens,
    };
  }

  async refresh(
    rawRefreshToken: string | undefined,
    ctx: ClientRequestContext,
  ): Promise<AuthSessionResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'Refresh token faltante.',
      });
    }

    const tokenHash = this.tokenCrypto.sha256Hex(rawRefreshToken);
    const existing = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    const now = new Date();

    if (!existing) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID_OR_EXPIRED,
        message: 'Refresh token inválido o expirado.',
      });
    }

    if (existing.revokedAt !== null) {
      await this.refreshTokenRepository.revokeFamily(existing.familyId, now);
      await this.auditService.record({
        actorUserId: existing.userId,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        targetType: 'RefreshTokenFamily',
        targetId: existing.familyId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        deviceFingerprint: ctx.deviceFingerprint,
        metadata: { reusedTokenId: existing.id },
      });
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_REUSED,
        message: 'Sesión comprometida: se detectó reutilización de refresh token.',
      });
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      await this.refreshTokenRepository.revokeById(existing.id, now);
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID_OR_EXPIRED,
        message: 'El refresh token expiró. Inicia sesión nuevamente.',
      });
    }

    const user = await this.userRepository.findById(existing.userId);
    if (!user || (user.lockedUntil && user.lockedUntil.getTime() > now.getTime())) {
      await this.refreshTokenRepository.revokeFamily(existing.familyId, now);
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: 'Cuenta no disponible para renovar sesión.',
      });
    }

    const nextRawRefreshToken = this.tokenCrypto.generateOpaqueToken(48);
    const refreshTtlDays = resolveRefreshTtlDays(this.config);
    const refreshMaxAgeMs = refreshTtlDays * 24 * 60 * 60 * 1000;
    const nextId = randomUUID();

    const rotation = await this.refreshTokenRepository.rotateToken({
      currentId: existing.id,
      revokedAt: now,
      nextId,
      userId: user.id,
      familyId: existing.familyId,
      nextTokenHash: this.tokenCrypto.sha256Hex(nextRawRefreshToken),
      nextExpiresAt: new Date(now.getTime() + refreshMaxAgeMs),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    if (!rotation.rotated) {
      await this.refreshTokenRepository.revokeFamily(existing.familyId, now);
      await this.auditService.record({
        actorUserId: existing.userId,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        targetType: 'RefreshTokenFamily',
        targetId: existing.familyId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        deviceFingerprint: ctx.deviceFingerprint,
        metadata: { raceReuseTokenId: existing.id },
      });
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_REUSED,
        message: 'Refresh token ya utilizado. Sesiones revocadas.',
      });
    }

    const { accessToken, accessMaxAgeMs } = await this.signAccessToken(user);

    await this.auditService.record({
      actorUserId: user.id,
      action: 'AUTH_REFRESH',
      targetType: 'RefreshToken',
      targetId: nextId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
      metadata: { familyId: existing.familyId },
    });

    return {
      user: toAuthUserView(user),
      tokens: {
        accessToken,
        refreshToken: nextRawRefreshToken,
        accessMaxAgeMs,
        refreshMaxAgeMs,
      },
    };
  }

  async logout(
    rawRefreshToken: string | undefined,
    actorUserId: string | null,
    ctx: ClientRequestContext,
  ): Promise<void> {
    let resolvedActor = actorUserId;

    if (rawRefreshToken) {
      const tokenHash = this.tokenCrypto.sha256Hex(rawRefreshToken);
      const record = await this.refreshTokenRepository.findByTokenHash(tokenHash);
      if (record) {
        resolvedActor = resolvedActor ?? record.userId;
        await this.refreshTokenRepository.revokeById(record.id, new Date());
      }
    }

    if (resolvedActor) {
      await this.auditService.record({
        actorUserId: resolvedActor,
        action: 'AUTH_LOGOUT',
        targetType: 'User',
        targetId: resolvedActor,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        deviceFingerprint: ctx.deviceFingerprint,
      });
    }
  }

  async getProfile(userId: string): Promise<AuthSessionResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    return {
      user: toAuthUserView(user),
    };
  }

  async setupTotp(userId: string, ctx: ClientRequestContext): Promise<TotpSetupResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const enrollment = this.totpService.generateEnrollment(user.email);
    await this.userRepository.savePendingTotpSecret(user.id, enrollment.encryptedSecret);

    await this.auditService.record({
      actorUserId: user.id,
      action: 'AUTH_2FA_SETUP_STARTED',
      targetType: 'User',
      targetId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
    });

    return {
      secret: enrollment.base32Secret,
      otpauthUri: enrollment.otpauthUri,
    };
  }

  async enableTotp(
    userId: string,
    code: string,
    ctx: ClientRequestContext,
  ): Promise<{ enabled: true; user: AuthSessionResponse['user'] }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (!user.totpSecretEncrypted) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.TOTP_INVALID,
        message: 'Debes iniciar primero la configuración 2FA antes de activarla.',
      });
    }

    const valid = this.totpService.verifyEncryptedCode(user.totpSecretEncrypted, code);
    if (!valid) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.TOTP_INVALID,
        message: 'El código TOTP de 6 dígitos es inválido o expiró.',
      });
    }

    const updated = await this.userRepository.enableTotp(user.id);

    await this.auditService.record({
      actorUserId: updated.id,
      action: 'AUTH_2FA_ENABLED',
      targetType: 'User',
      targetId: updated.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
    });

    return {
      enabled: true,
      user: toAuthUserView(updated),
    };
  }

  private async recordFailedLoginAttempt(
    user: UserRecord,
    now: Date,
    ctx: ClientRequestContext,
    reason: string,
  ): Promise<void> {
    const nextAttempts = user.failedLoginAttempts + 1;
    const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(now.getTime() + ACCOUNT_LOCKOUT_MS) : null;

    await this.userRepository.recordFailedLogin(user.id, nextAttempts, lockedUntil);

    await this.auditService.record({
      actorUserId: user.id,
      action: shouldLock ? 'AUTH_LOCKED' : 'AUTH_LOGIN_FAILED',
      targetType: 'User',
      targetId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceFingerprint: ctx.deviceFingerprint,
      metadata: { attempts: nextAttempts, reason },
    });
  }

  private async issueSessionTokenPair(
    user: UserRecord,
    familyId: string,
    ctx: ClientRequestContext,
  ): Promise<IssuedSessionTokens> {
    const { accessToken, accessMaxAgeMs } = await this.signAccessToken(user);
    const refreshToken = this.tokenCrypto.generateOpaqueToken(48);
    const refreshTtlDays = resolveRefreshTtlDays(this.config);
    const refreshMaxAgeMs = refreshTtlDays * 24 * 60 * 60 * 1000;

    await this.refreshTokenRepository.create({
      userId: user.id,
      familyId,
      tokenHash: this.tokenCrypto.sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + refreshMaxAgeMs),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      accessMaxAgeMs,
      refreshMaxAgeMs,
    };
  }

  private async signAccessToken(
    user: UserRecord,
  ): Promise<{ accessToken: string; accessMaxAgeMs: number }> {
    const accessTtlSeconds = resolveAccessTtlSeconds(this.config);
    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: resolveJwtAccessSecret(this.config),
      expiresIn: accessTtlSeconds,
    });

    return {
      accessToken,
      accessMaxAgeMs: accessTtlSeconds * 1000,
    };
  }
}
