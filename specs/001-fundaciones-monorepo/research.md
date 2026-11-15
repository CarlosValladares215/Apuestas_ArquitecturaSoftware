# Research: 001-fundaciones-monorepo

## Decisiones técnicas investigadas y validadas

### 1. Empaquetado de Monorepo (`pnpm` workspaces + Turborepo)

- **Decisión**: Usar `pnpm-workspace.yaml` (`apps/*`, `packages/*`) con `turbo.json` para orquestar `build`, `lint`, `typecheck` y `test`.
- **Razón**: Definido explícitamente en `PLAN.md` y `.specify/memory/constitution.md`. Permite caché de tareas, orden topológico (`packages/shared` se compila antes que `apps/api` y `apps/web`) y ejecución uniforme desde la raíz.
- **Alternativas descartadas**: `npm workspaces` (más lento y sin resolución estricta de dependencias) o `nx` (mayor complejidad innecesaria para 3 apps; viola Principio VI de simplicidad).

### 2. Backend NestJS (`apps/api`)

- **Decisión**: NestJS 11 con TypeScript estricto (`strict: true`), `helmet`, `ValidationPipe` global (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`), `@nestjs/config`, y pruebas unitarias + Supertest con Jest.
- **Razón**: Cumple `nestjs-best-practices` (`arch-feature-modules`, `security-validate-all-input`, `micro-use-health-checks`, `test-e2e-supertest`) y OWASP A02/A05 desde la base.
- **Alternativas descartadas**: Express puro sin estructura modular (no cumple el stack obligatorio de NestJS).

### 3. Frontend Next.js (`apps/web`)

- **Decisión**: Next.js 15 (App Router, TypeScript estricto), Tailwind CSS v4 (o CSS tokens nativos limpios sin sobrecarga), Jest / Vitest + React Testing Library para pruebas unitarias y de accesibilidad estructural, y configuración lista para Playwright E2E.
- **Razón**: Compatible con Vercel (`vercel.json`), Server Components por defecto (`vercel-react-best-practices`), y diseño limpio mobile-first desde 360 px (`frontend-design`).
- **Nota**: Usar Vitest + Testing Library o Jest + Testing Library en `apps/web`: elegimos **Jest + Testing Library** (o **Vitest + Testing Library**) — usar **Jest + Testing Library** mantiene un solo motor de pruebas TS en `apps/web`, `apps/api` y `packages/shared`, consistente con `PLAN.md` ("Pruebas: Jest + Supertest (API), Testing Library (web), Playwright (E2E), pytest (reportes)").

### 4. Servicio de Reportes Python (`apps/reports`)

- **Decisión**: Python 3.12, FastAPI, `pandas`, `pydantic-settings`, `ruff` (lint/format) y `pytest` + `httpx` (`TestClient`), definidos en `pyproject.toml` compatible con `uv` y `pip`.
- **Razón**: Cumple `PLAN.md` y el Principio VI (servicio independiente que leerá PostgreSQL con usuario de solo lectura).

### 5. Calidad, Commitlint y CI/CD

- **Decisión**: ESLint v9 flat config compartido, Prettier, Husky + `@commitlint/cli` + `@commitlint/config-conventional`, `.github/workflows/ci.yml`, `sonar-project.properties`, `docker-compose.yml` (PostgreSQL 16 + Redis 7), `render.yaml` y `apps/web/vercel.json`.
- **Razón**: Cierra todos los entregables técnicos verificables de la Fase F0 en `PLAN.md`.
