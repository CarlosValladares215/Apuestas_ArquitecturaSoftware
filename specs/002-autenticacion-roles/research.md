# Research: 002-autenticacion-roles

## Decisiones técnicas y de compatibilidad

### 1. ORM y compatibilidad sin Docker local (`Prisma 6` + Patrón Repositorio)
- **Decisión**: Usar `prisma@^6` + `@prisma/client@^6` sobre PostgreSQL como fuente oficial de esquema y migraciones (`apps/api/prisma/schema.prisma`), encapsulado detrás de interfaces de repositorio (`UserRepository`, `RefreshTokenRepository`, `VerificationTokenRepository`, `AuditLogRepository`).
- **Razón**: Cumple `PLAN.md` ("Prisma sobre PostgreSQL") y `nestjs-best-practices` (`arch-use-repository-pattern`). Además, permite seleccionar automáticamente `Prisma*Repository` cuando `DATABASE_URL` está configurada (producción/staging/Docker) y `InMemory*Repository` en entorno de pruebas (`NODE_ENV=test`) o cuando no hay `DATABASE_URL` local, logrando máxima compatibilidad sin romper `pnpm test` en máquinas sin Docker.

### 2. Hashing de contraseñas y tokens (`argon2` + `node:crypto` SHA-256)
- **Decisión**: Usar `argon2` (Argon2id) para contraseñas de usuario y SHA-256 (`node:crypto`) para `RefreshToken.tokenHash` y `EmailVerificationToken.tokenHash`.
- **Razón**: `PLAN.md` exige Argon2. Los tokens criptográficos aleatorios de 32+ bytes no requieren costoso stretching y SHA-256 permite búsqueda determinista por índice único en BD.

### 3. JWT en cookies `httpOnly` + Refresh Rotativo
- **Decisión**: Usar `@nestjs/jwt` + `cookie-parser`. El `access_token` (15 min) y el `refresh_token` (7 días) se emiten como cookies `httpOnly`, `SameSite=Lax`, `Secure` cuando `NODE_ENV=production`. El `JwtAuthGuard` lee primero la cookie `access_token` (y acepta header `Authorization: Bearer <token>` para clientes API/tests compatibles).
- **Razón**: Previene acceso a tokens desde JavaScript (mitigación XSS) y mantiene compatibilidad con `apps/reports` (Python) que validará el mismo JWT.

### 4. 2FA TOTP sin dependencias nativas problemáticas (`otpauth` + AES-256-GCM)
- **Decisión**: Usar `otpauth` (TypeScript puro RFC 6238) para generación/verificación TOTP y URIs `otpauth://`, cifrando el secreto en reposo con AES-256-GCM (`node:crypto`) mediante `TOTP_ENCRYPTION_KEY`.
- **Razón**: Cero conflictos CJS/ESM en Jest o builds multiplataforma Windows/Linux.

### 5. Rate Limiting y CAPTCHA desacoplado
- **Decisión**: `@nestjs/throttler` configurado con guard global + límites estrictos en `/auth/login`, `/auth/register`, `/auth/verify-email` (desactivable selectivamente o configurable vía `THROTTLE_ENABLED` / límites por env para pruebas funcionales aisladas, con tests explícitos dedicados a verificar el `429 Too Many Requests`). `CaptchaService` implementa proveedor `turnstile` (HTTP `https://challenges.cloudflare.com/turnstile/v0/siteverify`) y proveedor `mock` controlado para desarrollo/pruebas.
- **Razón**: Cumple `nestjs-best-practices` (`security-rate-limiting`) y `owasp-security` sin acoplar el suite de pruebas a red externa.
