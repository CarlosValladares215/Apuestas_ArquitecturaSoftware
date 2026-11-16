import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaStorageEnabled } from '../prisma/storage-mode';
import { UsersModule } from '../users/users.module';
import { resolveAccessTtlSeconds, resolveJwtAccessSecret } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { EmailVerificationNotifier } from './email-verification.notifier';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { EMAIL_VERIFICATION_REPOSITORY } from './repositories/email-verification.repository';
import { InMemoryEmailVerificationRepository } from './repositories/in-memory-email-verification.repository';
import { InMemoryRefreshTokenRepository } from './repositories/in-memory-refresh-token.repository';
import { PrismaEmailVerificationRepository } from './repositories/prisma-email-verification.repository';
import { PrismaRefreshTokenRepository } from './repositories/prisma-refresh-token.repository';
import { REFRESH_TOKEN_REPOSITORY } from './repositories/refresh-token.repository';
import { TokenCryptoService } from './token-crypto.service';
import { TotpService } from './totp.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtAccessSecret(config),
        signOptions: { expiresIn: resolveAccessTtlSeconds(config) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TokenCryptoService,
    TotpService,
    CaptchaService,
    EmailVerificationNotifier,
    InMemoryEmailVerificationRepository,
    PrismaEmailVerificationRepository,
    InMemoryRefreshTokenRepository,
    PrismaRefreshTokenRepository,
    {
      provide: EMAIL_VERIFICATION_REPOSITORY,
      inject: [
        ConfigService,
        PrismaService,
        InMemoryEmailVerificationRepository,
        PrismaEmailVerificationRepository,
      ],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryEmailVerificationRepository,
        prismaRepo: PrismaEmailVerificationRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      inject: [
        ConfigService,
        PrismaService,
        InMemoryRefreshTokenRepository,
        PrismaRefreshTokenRepository,
      ],
      useFactory: (
        config: ConfigService,
        _prisma: PrismaService,
        inMemory: InMemoryRefreshTokenRepository,
        prismaRepo: PrismaRefreshTokenRepository,
      ) => (isPrismaStorageEnabled(config) ? prismaRepo : inMemory),
    },
    AuthService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtModule, PasswordService, TotpService, JwtAuthGuard, RolesGuard, UsersModule],
})
export class AuthModule {}
