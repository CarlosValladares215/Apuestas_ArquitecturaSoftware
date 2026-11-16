# Implementation Plan: Fundaciones del Monorepo e Infraestructura Base

**Branch**: `feature/spec-1` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/001-fundaciones-monorepo/spec.md`

## Summary

Inicializar el monorepo de la plataforma de apuestas deportivas con `pnpm` workspaces + Turborepo (`apps/web`, `apps/api`, `apps/reports`, `packages/shared`), calidad automatizada (TypeScript estricto, ESLint, Prettier, Ruff, Husky + Commitlint), infraestructura local (`docker-compose.yml` con PostgreSQL 16 y Redis 7), pipeline CI/CD en GitHub Actions con SonarQube, plantillas de GitHub y manifiestos de despliegue para Vercel y Render.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 24) + Python 3.12  
**Primary Dependencies**: Turborepo, pnpm, Next.js 15 (App Router), NestJS 11 (`helmet`, `class-validator`, `@nestjs/config`), FastAPI + pandas + pydantic-settings  
**Storage**: PostgreSQL 16 + Redis 7 (definidos en `docker-compose.yml`; sin tablas de negocio en Spec 001)  
**Testing**: Jest + Supertest (`apps/api`), Jest + Testing Library (`apps/web`), Jest (`packages/shared`), pytest + httpx (`apps/reports`), Playwright configurado para E2E  
**Target Platform**: Linux containers (Render) + Edge/Node (Vercel) + desarrollo multiplataforma (Windows/Linux/macOS)  
**Project Type**: Monorepo web multi-servicio (`apps/web`, `apps/api`, `apps/reports`, `packages/shared`)  
**Performance Goals**: Endpoints `/health` con respuesta < 50 ms en ejecución local  
**Constraints**: Cero secretos en repositorio; configuración compatible con OWASP (headers seguros, validación estricta); diseño accesible WCAG 2.1 AA desde 360 px  
**Scale/Scope**: Esqueleto base verificable de las 3 aplicaciones y paquete compartido para desbloquear Specs 002–013

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **I. Seguridad y antifraude**: `.gitignore` protege `.env*`; `.env.example` sin secretos; `apps/api` habilita `helmet` y `ValidationPipe` estricto (`whitelist: true`, `forbidNonWhitelisted: true`); `apps/reports` documenta conexión solo lectura; CORS controlado por variable de entorno.
- [x] **II. Integridad financiera**: N/A para tablas de dinero en Spec 001 (pertenecen a Spec 003/004); `apps/web` no contiene lógica financiera ni de saldos.
- [x] **III. Servidor como autoridad**: `packages/shared` expone únicamente tipos/constantes/helpers de contrato sin reglas de autoridad del cliente.
- [x] **IV. Pruebas primero**: Se crean pruebas de contrato/integración y unitarias antes de implementar cada módulo (`packages/shared`, `apps/api` `/health`, `apps/reports` `/health`, `apps/web` vista principal).
- [x] **V. Tiempo real**: Redis incluido en `docker-compose.yml` para habilitar BullMQ y WebSockets en specs posteriores.
- [x] **VI. Simplicidad**: Exactamente `apps/web`, `apps/api`, `apps/reports` + biblioteca interna `packages/shared` (monorepo estándar de `PLAN.md`).
- [x] **VII. UX**: `apps/web` diseñado con `frontend-design`, mobile-first desde 360 px, semántica WCAG 2.1 AA, foco visible y preferencia de movimiento reducido.

## Project Structure

### Documentation (this feature)

```text
specs/001-fundaciones-monorepo/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   └── health.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   └── feature_spec.md
├── pull_request_template.md
└── workflows/
    └── ci.yml
apps/
├── api/
│   ├── src/
│   │   ├── health/
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── test/
│   ├── jest.config.ts
│   ├── package.json
│   └── tsconfig.json
├── reports/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   └── main.py
│   ├── tests/
│   │   └── test_health.py
│   └── pyproject.toml
└── web/
    ├── src/
    │   └── app/
    │       ├── globals.css
    │       ├── layout.tsx
    │       └── page.tsx
    ├── tests/
    │   └── page.test.tsx
    ├── e2e/
    │   └── health.spec.ts
    ├── jest.config.ts
    ├── next.config.ts
    ├── package.json
    ├── playwright.config.ts
    ├── tsconfig.json
    └── vercel.json
packages/
└── shared/
    ├── src/
    │   └── index.ts
    ├── tests/
    │   └── index.test.ts
    ├── jest.config.ts
    ├── package.json
    └── tsconfig.json
.env.example
.prettierrc.json
.husky/
└── commit-msg
commitlint.config.mjs
docker-compose.yml
eslint.config.mjs
package.json
pnpm-workspace.yaml
render.yaml
sonar-project.properties
tsconfig.base.json
turbo.json
```

**Structure Decision**: Monorepo `pnpm` + Turborepo con tres aplicaciones independientes (`apps/web`, `apps/api`, `apps/reports`) y un paquete compartido de tipos/contratos (`packages/shared`), alineado con `PLAN.md` y la Constitución.

## Complexity Tracking

> Sin violaciones a la Constitución. Ninguna excepción requerida.
