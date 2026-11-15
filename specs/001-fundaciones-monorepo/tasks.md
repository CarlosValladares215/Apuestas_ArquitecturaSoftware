# Tasks: Fundaciones del Monorepo e Infraestructura Base

**Input**: Design documents from `/specs/001-fundaciones-monorepo/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/health.openapi.yaml`

## Phase 1: Setup (Root Monorepo & Tooling)

- [x] T001 Configure root monorepo files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`)
- [x] T002 [P] Configure code quality tools (`eslint.config.mjs`, `.prettierrc.json`, `commitlint.config.mjs`, `.husky/commit-msg`)
- [x] T003 [P] Create local infrastructure and env templates (`docker-compose.yml`, `.env.example`)

---

## Phase 2: Foundational (`packages/shared` — TDD First)

- [x] T004 Write failing unit tests for shared contracts and helpers in `packages/shared/tests/index.test.ts`
- [x] T005 Implement `packages/shared/package.json`, `tsconfig.json`, `jest.config.ts`, and `packages/shared/src/index.ts` (`HealthStatus`, `AppRole`, `createHealthStatus`) and verify tests pass

---

## Phase 3: User Story 2 — Backend API `apps/api` (TDD First)

- [x] T006 [US2] Write failing Supertest/Jest tests for `GET /health` and security headers in `apps/api/test/health.e2e-spec.ts` and `apps/api/src/health/health.controller.spec.ts`
- [x] T007 [US2] Scaffold `apps/api` (`package.json`, `tsconfig.json`, `jest.config.ts`, `src/app.module.ts`, `src/main.ts`, `src/health/*`) with `helmet` and strict `ValidationPipe` and verify all tests pass

---

## Phase 4: User Story 2 — Reports Service `apps/reports` (TDD First)

- [x] T008 [US2] Write failing pytest test for `GET /health` in `apps/reports/tests/test_health.py`
- [x] T009 [US2] Scaffold `apps/reports` (`pyproject.toml`, `app/__init__.py`, `app/config.py`, `app/main.py`) with FastAPI + pandas + Ruff config and verify `pytest` and `ruff check` pass

---

## Phase 5: User Story 2 — Frontend `apps/web` (TDD First + `frontend-design`)

- [x] T010 [US2] Write failing Jest + Testing Library component/accessibility tests in `apps/web/tests/page.test.tsx`
- [x] T011 [US2] Scaffold `apps/web` (`package.json`, `tsconfig.json`, `next.config.ts`, `jest.config.ts`, `playwright.config.ts`, `e2e/health.spec.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `vercel.json`) following `frontend-design` and verify tests/lint/build pass

---

## Phase 6: User Story 3 — CI/CD, GitHub Governance & Docs

- [x] T012 [P] [US3] Create `.github/workflows/ci.yml`, `sonar-project.properties`, `render.yaml`
- [x] T013 [P] [US3] Create `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_spec.md`, `.github/pull_request_template.md`
- [x] T014 [US3] Update `CLAUDE.md` with real build/lint/test commands and update `specs/README.md` status for `001-fundaciones-monorepo`
- [x] T015 Run full verification (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `ruff check`, `pytest`, commitlint test)
