---
description: 'Task list for 005-partidos-mercados and 006-sincronizacion-api-football (Phase F3)'
---

# Tasks: Partidos, Mercados y Sincronización con API-Football

**Input**: Design documents from `/specs/005-partidos-mercados/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/matches-markets.openapi.yaml`

**Tests**: OBLIGATORIOS antes de la implementación (Principio IV de la Constitución y skill `test-driven-development`: escribir primero las pruebas en RED, verificar que fallen y luego implementar hasta GREEN).

**Organization**: Las tareas están agrupadas por fase y por historia de usuario (`[US1]`, `[US2]`, `[US3]`, `[US4]`) para permitir verificación incremental e independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Ejecutable en paralelo (archivos independientes)
- **[Story]**: Historia de usuario a la que pertenece (`[US1]`, `[US2]`, `[US3]`, `[US4]`)

---

## Phase 1: Setup & SDD Documentation

**Purpose**: Preparar la rama `feature/spec-4` y completar los artefactos SDD de las specs `005-partidos-mercados` y `006-sincronizacion-api-football`.

- [x] T001 Crear rama `feature/spec-4` desde `develop`, asegurar `.env` local e instalar dependencias del workspace
- [x] T002 Crear `specs/005-partidos-mercados/spec.md` y `specs/005-partidos-mercados/checklists/requirements.md`
- [x] T003 [P] Crear `specs/005-partidos-mercados/plan.md`, `specs/005-partidos-mercados/research.md`, `specs/005-partidos-mercados/data-model.md`, `specs/005-partidos-mercados/contracts/matches-markets.openapi.yaml` y `specs/005-partidos-mercados/quickstart.md`
- [x] T004 Actualizar bloque `SPECKIT` en `CLAUDE.md` apuntando a `specs/005-partidos-mercados/plan.md`

---

## Phase 2: Foundational (`packages/shared` — TDD First)

**Purpose**: Contratos compartidos, máquina de estados del partido, regla pura de cierre de mercados pre-partido según reloj del servidor y cálculo de presupuesto/frecuencia adaptativa de API-Football.

**⚠️ CRITICAL**: Bloquea la implementación de `apps/api` y `apps/web`.

- [x] T005 Escribir pruebas unitarias en rojo (RED) para transiciones de estado del partido, bloqueo de mercados pre-partido y presupuesto/frecuencia adaptativa en `packages/shared/tests/index.test.ts`
- [x] T006 Implementar tipos, constantes y funciones puras (`MATCH_STATUSES`, `canTransitionMatchStatus`, `assertValidMatchTransition`, `shouldAutoClosePreMatchMarket`, `isPreMatchMarketOpen`, `calculateAdaptiveSyncIntervalMs`, `canConsumeApiFootballQuota`) en `packages/shared/src/index.ts` y verificar que pasen en verde (GREEN)

**Checkpoint**: `packages/shared` compila y pasa todas sus pruebas unitarias.

---

## Phase 3: User Story 1 & User Story 2 — Máquina de Estados, Cierre de Mercados y CRUD de Operador en `apps/api` (Priority: P1) 🎯 MVP

**Goal**: Implementar en `apps/api` el dominio de competiciones, partidos, mercados y cuotas manuales con cierre automático de mercados pre-partido según el reloj del servidor, control de acceso por rol (`operator`/`admin`) y bitácora de auditoría append-only.

**Independent Test**: `pnpm --filter @apuestas/api test` valida todas las transiciones válidas e inválidas, el bloqueo de mercados tras `kickoffAt` del servidor y el rechazo `403` para roles no autorizados.

### Tests for User Story 1 & 2 (Write FIRST — Verify RED) ⚠️

- [x] T007 [P] [US1] Escribir pruebas unitarias en rojo (RED) para máquina de estados del partido, cierre automático de mercados pre-partido según reloj del servidor y CRUD de mercados/cuotas con auditoría en `apps/api/src/matches/matches.service.spec.ts`
- [x] T008 [P] [US2] Escribir pruebas de integración HTTP (Supertest) en rojo (RED) para `GET /matches`, `GET /matches/:id`, `POST /matches`, `PATCH /matches/:id/status`, `POST /matches/:id/markets`, `PATCH /matches/:id/markets/:marketId/odds` y RBAC en `apps/api/test/matches.e2e-spec.ts`

### Implementation for User Story 1 & 2 (Make GREEN)

- [x] T009 [P] [US1] Crear proveedor de reloj del servidor (`CLOCK_PORT`) y datos semilla iniciales en `apps/api/src/matches/clock.provider.ts` y `apps/api/src/matches/matches.seed.ts`
- [x] T010 [P] [US2] Crear DTOs con validaciones `class-validator` (`CreateMatchDto`, `UpdateMatchStatusDto`, `CreateMarketDto`, `UpdateMarketOddsDto`, `RunSyncDto`) en `apps/api/src/matches/dto/matches.dto.ts` y guard `OperatorRoleGuard` en `apps/api/src/matches/guards/operator-role.guard.ts`
- [x] T011 [US1] Implementar `MatchesService` (máquina de estados, cierre automático de mercados pre-partido según reloj del servidor, CRUD de mercados y cuotas manuales, y bitácora de auditoría append-only) en `apps/api/src/matches/matches.service.ts`

**Checkpoint**: Las pruebas de `MatchesService` pasan en verde.

---

## Phase 4: User Story 3 — Worker de Sincronización con API-Football en `apps/api` (Priority: P2)

**Goal**: Implementar `ApiFootballSyncService` en `apps/api` con presupuesto diario de peticiones, reserva exclusiva para partidos en vivo, frecuencia adaptativa y protección total de `API_FOOTBALL_KEY`.

**Independent Test**: `pnpm --filter @apuestas/api test -- api-football-sync.service.spec.ts` verifica que el worker ajusta su frecuencia si hay partidos en vivo, respeta la reserva en vivo y detiene las peticiones al agotar el presupuesto diario.

### Tests for User Story 3 (Write FIRST — Verify RED) ⚠️

- [x] T012 [US3] Escribir pruebas unitarias en rojo (RED) para presupuesto diario, reserva en vivo, reinicio de día UTC, frecuencia adaptativa e importación de resultados/cuotas en `apps/api/src/matches/api-football-sync.service.spec.ts`

### Implementation for User Story 3 (Make GREEN)

- [x] T013 [US3] Implementar `ApiFootballSyncService` en `apps/api/src/matches/api-football-sync.service.ts` y exponer endpoints `/matches/sync/status` y `/matches/sync/run` en `apps/api/src/matches/matches.controller.ts`
- [x] T014 [US3] Registrar `MatchesModule` en `apps/api/src/matches/matches.module.ts` e importarlo en `apps/api/src/app.module.ts`, verificando que todas las pruebas unitarias y E2E de `apps/api` pasen en verde (GREEN)

**Checkpoint**: `apps/api` pasa el 100% de pruebas unitarias y E2E.

---

## Phase 6: User Story 4 — Cartelera de Partidos y Detalle de Mercados en `apps/web` (Priority: P2)

**Goal**: Construir la cartelera de partidos y el panel de detalle de mercados en `apps/web` con filtros por estado y competición, diseño mobile-first desde 360 px y cumplimiento WCAG 2.1 AA siguiendo `frontend-design`.

**Independent Test**: `pnpm --filter @apuestas/web test` valida el renderizado semántico, filtros interactivos, visualización de mercados abiertos vs cerrados por reloj del servidor y ausencia de claves secretas.

### Tests for User Story 4 (Write FIRST — Verify RED) ⚠️

- [x] T015 [US4] Escribir pruebas de componentes y accesibilidad en rojo (RED) para cartelera de partidos, filtros por estado/competición, detalle de mercados y bloqueo de mercados cerrados en `apps/web/tests/page.test.tsx`

### Implementation for User Story 4 (Make GREEN)

- [x] T016 [US4] Implementar componente interactivo `Matchboard` en `apps/web/src/components/matchboard.tsx` e integrarlo en `apps/web/src/app/page.tsx` y `apps/web/src/app/globals.css` siguiendo `frontend-design` y `vercel-react-best-practices`

**Checkpoint**: `apps/web` pasa todas sus pruebas en verde y compila sin errores.

---

## Phase 7: Polish, Catálogo de Specs & Verificación Final

**Purpose**: Actualizar el catálogo de specs, verificar formato/lint/tipos/tests/build en todo el monorepo, realizar commits atómicos y subir la rama `feature/spec-4`.

- [x] T017 Actualizar `specs/README.md` cambiando el estado de `005-partidos-mercados` y `006-sincronizacion-api-football` a `Terminada` y marcar todas las tareas completadas en `specs/005-partidos-mercados/tasks.md`
- [x] T018 Ejecutar `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` verificando cero errores
- [x] T019 Crear commits atómicos siguiendo Conventional Commits y subir la rama con `git push -u origin feature/spec-4`
