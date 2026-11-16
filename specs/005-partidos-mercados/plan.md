# Implementation Plan: Partidos, Mercados y Sincronización con API-Football

**Branch**: `feature/spec-4` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/005-partidos-mercados/spec.md`

## Summary

Implementar la Fase F3 (`005-partidos-mercados` y `006-sincronizacion-api-football`) de la plataforma de apuestas deportivas:
1. Contrato compartido y funciones puras de dominio en `packages/shared` (entidades de competición, partido, mercado, selección y cuota; máquina de estados `programado → en_vivo → finalizado`, `suspendido`, `aplazado`, `cancelado`; cierre automático de mercados pre-partido según reloj del servidor; y cálculo de presupuesto diario + frecuencia adaptativa para API-Football).
2. Módulo `MatchesModule` en `apps/api` (NestJS) con endpoints públicos de cartelera/detalle, CRUD protegido para `operator`/`admin`, bitácora de auditoría append-only (`MatchAuditEntry`), reloj de servidor inyectable (`CLOCK_PORT`) y worker `ApiFootballSyncService` que respeta el presupuesto diario y mantiene `API_FOOTBALL_KEY` exclusivamente en el backend.
3. Cartelera interactiva y vista de detalle de mercados en `apps/web` (Next.js App Router) con diseño mobile-first desde 360 px y cumplimiento WCAG 2.1 AA siguiendo `frontend-design`.

## Technical Context

**Language/Version**: TypeScript 5.9 (Node.js 22+)  
**Primary Dependencies**: `@apuestas/shared`, NestJS 11 (`@nestjs/common`, `@nestjs/config`, `class-validator`, `class-transformer`, `helmet`), Next.js 15 + React 19  
**Storage**: Esquema relacional PostgreSQL 16 documentado con `supabase-postgres-best-practices` (`numeric(10,4)` para cuotas, índices compuestos/parciales) + repositorio determinista en memoria en `apps/api` para ejecución rápida en CI/tests sin acoplamiento de red  
**Testing**: Jest + Supertest (`apps/api`), Jest + React Testing Library (`apps/web`), Jest (`packages/shared`) siguiendo TDD estricto (`test-driven-development`)  
**Target Platform**: Render (`apps/api`) y Vercel (`apps/web`)  
**Project Type**: Monorepo web multi-servicio (`apps/web`, `apps/api`, `apps/reports`, `packages/shared`)  
**Performance Goals**: Lectura de cartelera `GET /matches` < 50 ms; evaluación instantánea de cierre de mercados con el reloj del servidor; `0` peticiones a API-Football sobre el presupuesto diario configurado  
**Constraints**: `API_FOOTBALL_KEY` solo en el backend; RBAC por rol (`operator`/`admin` para escritura); cuotas decimales $\ge 1.01$; interfaz usable desde 360 px y accesible WCAG 2.1 AA  
**Scale/Scope**: Fase F3 completa (`005-partidos-mercados` + `006-sincronizacion-api-football`), habilitando la Fase F4 (boleto de apuesta) y F5 (liquidación en tiempo real)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **I. Seguridad y antifraude**: Vectores de fraude mitigados (*past-posting* bloqueado con reloj del servidor; mutaciones de partidos/mercados/cuotas protegidas por `OperatorRoleGuard` denegado por defecto; auditoría append-only en cada cambio de estado, cuota o sincronización; `API_FOOTBALL_KEY` nunca sale de `apps/api`; DTOs validados con `ValidationPipe` estricto).
- [x] **II. Integridad financiera**: Esta spec no mueve saldos de billetera (eso pertenece a Specs 003/004/007/008), pero garantiza la integridad de las cuotas ($\ge 1.01$) y la inmutabilidad del cierre pre-partido que alimenta al motor de apuestas.
- [x] **III. Servidor como autoridad**: El reloj del servidor (`ServerClock`) en `apps/api` decide si un mercado pre-partido está abierto o cerrado; `apps/web` solo renderiza el estado recibido y nunca calcula ganancias ni consulta a API-Football.
- [x] **IV. Pruebas primero**: Se diseñan y ejecutan primero en rojo (RED) las pruebas de máquina de estados, bloqueo de mercados tras la hora de inicio del servidor, presupuesto diario del worker de API-Football, RBAC de operador y cartelera accesible en `apps/web`.
- [x] **V. Tiempo real**: Un único worker (`ApiFootballSyncService`) consulta el proveedor deportivo respetando el presupuesto diario (`dailyBudget`), la reserva para partidos en vivo (`liveReserve`) y la frecuencia adaptativa (`60s` en vivo vs `30m` programados), preparando eventos para publicación y liquidación.
- [x] **VI. Simplicidad**: Se mantienen exactamente las tres aplicaciones constitucionales (`apps/web`, `apps/api`, `apps/reports`) más `packages/shared`. Sin servicios adicionales.
- [x] **VII. UX**: Cartelera de partidos y detalle de mercados construidos con `frontend-design`, mobile-first desde 360 px, contraste WCAG 2.1 AA, foco visible por teclado, tipografía tabular para cuotas y mensajes claros de mercado cerrado.

## Project Structure

### Documentation (this feature)

```text
specs/005-partidos-mercados/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   └── matches-markets.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
packages/
└── shared/
    ├── src/
    │   └── index.ts
    └── tests/
        └── index.test.ts
apps/
├── api/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── health/
│   │   └── matches/
│   │       ├── api-football-sync.service.spec.ts
│   │       ├── api-football-sync.service.ts
│   │       ├── clock.provider.ts
│   │       ├── dto/
│   │       │   └── matches.dto.ts
│   │       ├── guards/
│   │       │   └── operator-role.guard.ts
│   │       ├── matches.controller.ts
│   │       ├── matches.module.ts
│   │       ├── matches.seed.ts
│   │       ├── matches.service.spec.ts
│   │       └── matches.service.ts
│   └── test/
│       ├── health.e2e-spec.ts
│       └── matches.e2e-spec.ts
└── web/
    ├── src/
    │   ├── app/
    │   │   ├── globals.css
    │   │   ├── layout.tsx
    │   │   └── page.tsx
    │   └── components/
    │       └── matchboard.tsx
    └── tests/
        └── page.test.tsx
```

**Structure Decision**: Se extiende `packages/shared` con los tipos y reglas puras de dominio de F3, se añade el módulo cohesivo `src/matches/` en `apps/api` siguiendo `nestjs-best-practices` (`arch-feature-modules`, `di-use-interfaces-tokens`, `security-validate-all-input`, `security-use-guards`), y se incorpora el componente `matchboard.tsx` en `apps/web` siguiendo `frontend-design` y `vercel-react-best-practices`.

## Complexity Tracking

> Sin violaciones a la Constitución. Ninguna excepción requerida.
