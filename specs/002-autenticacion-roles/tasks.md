# Tasks: Identidad, Autenticación, RBAC y Auditoría

**Input**: Design documents from `/specs/002-autenticacion-roles/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/auth.openapi.yaml`

## Phase 1: Setup & Shared Contracts

- [x] T001 Install Spec 002 dependencies (`@nestjs/jwt`, `@nestjs/throttler`, `argon2`, `otpauth`, `cookie-parser`, `prisma`, `@prisma/client`) and update `.env.example` / `apps/api/src/bootstrap.ts`
- [x] T002 Write failing unit tests for shared auth/audit types in `packages/shared/tests/index.test.ts` and implement contracts in `packages/shared/src/index.ts`
- [x] T003 Define PostgreSQL Prisma schema (`apps/api/prisma/schema.prisma`) and SQL migration (`apps/api/prisma/migrations/0001_init_auth_audit/migration.sql`), validate with `prisma validate` and `prisma generate`

---

## Phase 2: Foundational — Audit & Repository Layer (TDD First)

- [x] T004 Write failing unit tests for `AuditService`, `PasswordService` (Argon2id), and `TotpService` (AES-256-GCM + RFC 6238)
- [x] T005 Implement `PrismaService`, repository interfaces + Prisma/Memory adapters (`audit`, `users`, `auth`), `AuditModule`, `PasswordService`, and `TotpService` and verify tests pass

---

## Phase 3: User Stories 1, 2 & 3 — Auth API, RBAC Default-Deny & Admin (TDD First)

- [x] T006 [US1][US2][US3] Write failing Supertest integration tests in `apps/api/test/auth.e2e-spec.ts` covering: underage rejection, email verification, Argon2 login with `httpOnly` cookies, brute-force lockout, rate limiting (`429`), refresh rotation & reuse family revocation, 2FA setup/enable/login, RBAC matrix (`401`/`403`/`200`) and `AuditLog` persistence
- [x] T007 [US1][US2][US3] Implement `CaptchaService`, `EmailVerificationNotifier`, `JwtAuthGuard`, `RolesGuard` (registered as global `APP_GUARD`), `AuthService`, `AuthController`, `AdminUsersController`, and `AdminAuditController` and verify all unit + e2e tests pass

---

## Phase 4: User Story 4 — Frontend Auth & Security Views (TDD First + `frontend-design`)

- [x] T008 [US4] Write failing React Testing Library tests for `/registro`, `/login`, `/verificar-correo`, `/seguridad`, and `/admin/usuarios` (`apps/web/tests/auth-pages.test.tsx`)
- [x] T009 [US4] Implement accessible mobile-first (360 px) views and API client (`credentials: 'include'`) in `apps/web/src/` and update navigation in `apps/web/src/app/page.tsx` and Playwright tests in `apps/web/e2e/auth.spec.ts`

---

## Phase 5: Verification, Docs & Finish

- [x] T010 Update `specs/README.md` (`002-autenticacion-roles` -> `Terminada`) and `specs/002-autenticacion-roles/tasks.md`
- [x] T011 Run full verification (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `prisma validate`)
