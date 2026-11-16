# Implementation Plan: Identidad, Autenticación, RBAC y Auditoría

**Branch**: `feature/spec-2` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/002-autenticacion-roles/spec.md`

## Summary

Implementar identidad, autenticación segura y control de acceso RBAC denegado por defecto en `apps/api` (NestJS + Prisma/PostgreSQL con patrón repositorio compatible con pruebas sin Docker), auditoría inmutable append-only, 2FA TOTP cifrado en reposo, protección anti-fuerza bruta + throttler + CAPTCHA, contratos compartidos en `packages/shared`, y vistas responsivas accesibles en `apps/web` (`/registro`, `/login`, `/verificar-correo`, `/seguridad`, `/admin/usuarios`).

## Technical Context

**Language/Version**: TypeScript 5.9 (Node.js 22/24)  
**Primary Dependencies**: NestJS 11 (`@nestjs/jwt`, `@nestjs/throttler`), `argon2`, `otpauth`, `cookie-parser`, `prisma` v6 (`@prisma/client`), Next.js 15 App Router  
**Storage**: PostgreSQL 16 vía Prisma (`schema.prisma` + migración inicial) + repositorios *in-memory* tras interfaces DI para ejecución de tests sin Docker  
**Testing**: Jest + Supertest (`apps/api`), Jest + Testing Library (`apps/web`), Jest (`packages/shared`), Playwright E2E  
**Target Platform**: Linux (Render/CI) + Vercel + desarrollo local multiplataforma Windows/macOS/Linux  
**Project Type**: Monorepo (`apps/api`, `apps/web`, `packages/shared`)  
**Performance Goals**: Login/refresh < 250 ms (coste controlado Argon2id); consultas de auditoría indexadas por actor y fecha  
**Constraints**: Default-deny RBAC global; cookies `httpOnly`; cero tokens en `localStorage`; cero secretos en repo  
**Scale/Scope**: Módulos `AuthModule`, `UsersModule`, `AuditModule`, `PrismaModule` en `apps/api` + 5 rutas UI en `apps/web`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Seguridad y antifraude**: Vectores de fraude documentados en `spec.md`; `JwtAuthGuard` + `RolesGuard` globales denegados por defecto; `AuditLog` append-only; secretos solo por env; `ValidationPipe` estricto (`forbidNonWhitelisted`); cookies `httpOnly`; secreto TOTP cifrado AES-256-GCM.
- [x] **II. Integridad financiera**: N/A directamente en Spec 002 (billetera/ledger en Spec 003), pero expone `totpEnabled` y `AuditService` necesarios para retiros y dinero.
- [x] **III. Servidor como autoridad**: El rol siempre se asigna y valida en el servidor; bloqueo y expiraciones calculados con reloj del servidor.
- [x] **IV. Pruebas primero**: Pruebas unitarias y Supertest (matriz RBAC, fuerza bruta, reuso de refresh, 2FA, auditoría) redactadas en RED antes que los servicios/controladores.
- [x] **V. Tiempo real**: N/A para Spec 002.
- [x] **VI. Simplicidad**: Sin nuevos servicios; todo dentro de `apps/api`, `apps/web` y `packages/shared`.
- [x] **VII. UX**: Vistas mobile-first desde 360 px, WCAG 2.1 AA, etiquetas `<label>`, foco visible y `frontend-design`.

## Project Structure

### Documentation (this feature)

```text
specs/002-autenticacion-roles/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   └── auth.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
packages/shared/src/
└── index.ts                  # Roles, AuthUserView, AuditAction, AuthErrorCodes

apps/api/
├── prisma/
│   ├── schema.prisma
│   └── migrations/0001_init_auth_audit/migration.sql
└── src/
    ├── prisma/               # PrismaService & PrismaModule
    ├── audit/                # AuditModule, AuditService, AuditLogRepository (Prisma + Memory)
    ├── users/                # UsersModule, UserRepository (Prisma + Memory), AdminUsersController
    └── auth/                 # AuthModule, AuthController, AuthService, PasswordService, TotpService,
                              # CaptchaService, TokenCryptoService, JwtAuthGuard, RolesGuard, decorators

apps/web/src/
├── lib/api-client.ts         # Cliente fetch con credentials: 'include'
└── app/
    ├── registro/page.tsx
    ├── login/page.tsx
    ├── verificar-correo/page.tsx
    ├── seguridad/page.tsx
    └── admin/usuarios/page.tsx
```

**Structure Decision**: Módulos independientes por dominio (`prisma`, `audit`, `users`, `auth`) dentro de `apps/api` con inyección por interfaces para compatibilidad total con PostgreSQL y pruebas sin Docker.

## Complexity Tracking

> Sin violaciones a la Constitución. Ninguna excepción requerida.
