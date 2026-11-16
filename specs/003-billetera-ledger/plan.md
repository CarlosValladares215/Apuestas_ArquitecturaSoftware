# Implementation Plan: Ledger Contable Inmutable, Billetera y Depósitos Payphone

**Branch**: `feature/spec-3` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/003-billetera-ledger/spec.md`

## Summary

Implementar el sistema financiero central de la plataforma de apuestas (Fase F2 de `PLAN.md`): libro contable (ledger) inmutable de partida doble con cuentas diferenciadas (`user_real`, `user_bonus`, `house`, `gateway`), derivación estricta de saldos a partir de los asientos contables sin mutaciones directas de columnas de saldo, servicio transaccional de billetera con bloqueo pesimista de fila (`SELECT ... FOR UPDATE`) para erradicar condiciones de carrera y doble gasto, claves de idempotencia obligatorias, integración de depósitos con Payphone en modo sandbox mediante confirmación estricta servidor a servidor (con validación de monto, moneda y referencia), y vista web en `apps/web` (solo presentación, mobile-first desde 360 px y WCAG 2.1 AA).

## Technical Context

**Language/Version**: TypeScript 5.9+ (Node.js 22/24)  
**Primary Dependencies**: NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/config`, `class-validator`, `class-transformer`, `helmet`), Next.js 15 (App Router, React 19), Turborepo, pnpm workspaces  
**Storage**: PostgreSQL 16 (modelo relacional con claves foráneas, índices por cuenta e idempotencia) + abstracción de repositorio transaccional con control de aislamiento y locking para pruebas concurrentes  
**Testing**: Jest + Supertest (`apps/api`), Jest + React Testing Library (`apps/web`), Jest (`packages/shared`), con suite exhaustiva de concurrencia (`Promise.all`), idempotencia y rechazo de fraude  
**Target Platform**: Render (API NestJS) + Vercel (Next.js) + contenedores Linux  
**Project Type**: Monorepo web multi-servicio (`apps/api`, `apps/web`, `packages/shared`)  
**Performance Goals**: Consultas de saldo derivadas en < 30 ms; operaciones concurrentes de billetera serializadas sin inconsistencias de saldo ni deadlocks  
**Constraints**: Invariantes innegociables de la Constitución (Principios I y II): el dinero solo se mueve por ledger de partida doble, ninguna columna mutable de saldo almacena el balance, el redirect del navegador jamás acredita fondos, secretos en variables de entorno  
**Scale/Scope**: Módulo de billetera y ledger base capaz de soportar depósitos, consultas de movimientos y ser consumido por las futuras specs de apuestas (007) y liquidación (008)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md`. Principios I y II innegociables.

- [x] **I. Seguridad y antifraude (NO NEGOCIABLE)**:
  - Vectores de fraude identificados y mitigados:
    1. *Manipulación del redirect del navegador*: La redirección del navegador solo dispara una consulta de estado; nunca acredita saldo por sí misma.
    2. *Alteración de parámetros en confirmación (tampering)*: El backend valida directamente contra la API de Payphone que el monto, la moneda (`USD`) y el `clientTransactionId` coincidan con la intención original registrada.
    3. *Doble gasto por concurrencia*: Bloqueo a nivel de fila (`SELECT ... FOR UPDATE` / mutex transaccional por usuario) que serializa operaciones sobre la misma billetera.
    4. *Replay de peticiones*: Claves de idempotencia obligatorias en cabecera o cuerpo; peticiones repetidas retornan el resultado previo sin duplicar asientos.
    5. *Exposición de credenciales*: `PAYPHONE_TOKEN` y secretos residen exclusivamente en variables de entorno del backend en `apps/api`.
  - Auditoría: Toda acción sensible (depósito, débito, intento con datos alterados) se registra en `audit_logs` append-only.
- [x] **II. Integridad financiera (NO NEGOCIABLE)**:
  - Modelo de partida doble: Toda transacción tiene al menos dos asientos cuya suma neta es cero (`sum(credits) == sum(debits)`).
  - Cuentas separadas: `user_real:{userId}` y `user_bonus:{userId}` se auditan independientemente de `house` y `gateway:payphone`.
  - Saldo derivado: El saldo se obtiene calculando `SUM(credits) - SUM(debits)` de los asientos del ledger. No existe `UPDATE users SET balance = ...`.
  - Inmutabilidad: Cero `UPDATE` o `DELETE` sobre asientos contables. Correcciones solo mediante transacciones compensatorias.
  - Idempotencia: Doble confirmación de pasarela o doble ejecución de débito no duplica movimientos.
- [x] **III. Servidor como única autoridad**:
  - `apps/web` es exclusivamente una capa de presentación. No realiza sumas, cálculos de comisiones ni determinaciones de saldo.
  - Toda validación de montos mínimos y disponibilidad de saldo se ejecuta en `apps/api`.
- [x] **IV. Pruebas primero en dominios críticos**:
  - Se definen y escriben pruebas rojas (RED) antes de implementar el código de producción:
    1. Prueba de concurrencia: N débitos simultáneos sobre la misma billetera dejan el saldo exacto sin sobregiros.
    2. Prueba de idempotencia: Doble confirmación con la misma clave de idempotencia acredita exactamente una sola vez.
    3. Prueba de alteración (tampering): Rechazo automático si Payphone reporta un monto o moneda que difiere de la intención registrada.
    4. Prueba de saldo insuficiente: Rechazo atómico de débito cuando el saldo disponible es menor al monto solicitado.
- [x] **V. Tiempo real confiable**:
  - Preparado para notificaciones de cambio de saldo y eventos de ledger vía eventos del dominio NestJS (`EventEmitter2` o WebSockets en F5).
- [x] **VI. Simplicidad y límites de servicio**:
  - Mantenido en las 3 aplicaciones constitucionales (`apps/web`, `apps/api`, `apps/reports`) y la biblioteca compartida `packages/shared`. Sin microservicios adicionales innecesarios.
- [x] **VII. Experiencia accesible y responsiva**:
  - Interfaz en `apps/web` implementada con enfoque mobile-first desde 360 px, semántica accesible (landmarks, roles ARIA, etiquetas asociadas), contraste WCAG 2.1 AA y foco visible.

---

## Project Structure

### Documentation (this feature)

```text
specs/003-billetera-ledger/
├── spec.md              # Especificación funcional y de seguridad
├── plan.md              # Este plan de implementación
├── research.md          # Investigación técnica y decisiones arquitectónicas
├── data-model.md        # Modelo relacional y contratos de entidades
├── quickstart.md        # Guía de ejecución y verificación
├── checklists/
│   └── requirements.md  # Lista de verificación de requisitos
├── contracts/
│   └── wallet.openapi.yaml # Especificación OpenAPI de endpoints
└── tasks.md             # Tareas ordenadas según ciclo TDD
```

### Source Code

```text
packages/shared/
├── src/
│   └── index.ts         # Tipos y contratos: Ledger, Wallet, Payphone DTOs, Enums y utilidades puras
└── tests/
    └── ledger.test.ts   # Pruebas unitarias de contratos compartidos

apps/api/
├── src/
│   ├── wallet/
│   │   ├── dto/
│   │   │   ├── create-deposit-intent.dto.ts
│   │   │   ├── confirm-deposit.dto.ts
│   │   │   └── debit-wallet.dto.ts
│   │   ├── entities/
│   │   │   ├── ledger-account.entity.ts
│   │   │   ├── ledger-transaction.entity.ts
│   │   │   ├── ledger-entry.entity.ts
│   │   │   └── payment-intent.entity.ts
│   │   ├── repositories/
│   │   │   ├── ledger.repository.interface.ts
│   │   │   ├── wallet.repository.interface.ts
│   │   │   └── in-memory-ledger.repository.ts
│   │   ├── services/
│   │   │   ├── ledger.service.ts
│   │   │   ├── wallet.service.ts
│   │   │   └── payphone.service.ts
│   │   ├── wallet.controller.ts
│   │   └── wallet.module.ts
│   ├── database/
│   │   └── schema.sql   # DDL SQL PostgreSQL con índices y constraints
│   └── app.module.ts
└── test/
    ├── wallet-concurrency.spec.ts  # Pruebas de concurrencia pura (N débitos simultáneos)
    ├── wallet-idempotency.spec.ts  # Pruebas de doble confirmación e idempotencia
    ├── payphone-tampering.spec.ts  # Pruebas de detección y rechazo de montos alterados
    └── wallet.e2e-spec.ts          # Integración Supertest E2E

apps/web/
├── src/
│   └── app/
│       └── wallet/
│           ├── page.tsx            # Vista de billetera (saldo, recarga, movimientos)
│           └── components/
│               ├── balance-card.tsx
│               ├── deposit-form.tsx
│               └── movements-table.tsx
└── tests/
    └── wallet.test.tsx             # Pruebas de renderizado, accesibilidad y no-cálculo en cliente
```

---

## Complexity Tracking

| Complejidad | Justificación | Alternativa más simple considerada y descartada |
|---|---|---|
| Partida doble para toda transacción monetaria | Requisito constitucional no negociable (Principio II). Es el estándar bancario y de apuestas para garantizar auditabilidad absoluta. | Saldo mutable simple en tabla `users` (descartado por riesgo extremo de corrupción y fraude). |
| Bloqueo pesimista de fila (`SELECT ... FOR UPDATE` / mutex transaccional por billetera) | Imprescindible para evitar condiciones de carrera en débitos simultáneos (doble gasto). | Bloqueo optimista con versión (descartado porque genera excepciones de colisión innecesarias bajo ráfagas de apuestas en vivo). |
| Manejo de centavos enteros (`cents`) | Elimina cualquier error de precisión aritmética de coma flotante (`0.1 + 0.2 != 0.3`). | `FLOAT` / `DOUBLE PRECISION` en base de datos (descartado rotundamente para dominios financieros). |
