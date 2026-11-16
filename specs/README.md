# Catálogo de specs

Listado de especificaciones previstas (Spec Kit), en orden de construcción. Cada spec se crea con
`/speckit-specify` en una rama `feature/NNN-nombre` y su carpeta vive en `specs/NNN-nombre/`.

Fuente: fases de [`PLAN.md`](../PLAN.md). Reglas: [constitución](../.specify/memory/constitution.md).

| #   | Spec                              | Fase | Alcance                                                                           | Estado    |
| --- | --------------------------------- | ---- | --------------------------------------------------------------------------------- | --------- |
| 001 | `001-fundaciones-monorepo`        | F0   | Monorepo con las tres apps, CI/CD, SonarQube, despliegues Vercel/Render y Grafana | Terminada |
| 002 | `002-autenticacion-roles`         | F1   | Registro, login, 2FA, roles (RBAC), bloqueo por intentos fallidos y auditoría     | Terminada |
| 003 | `003-billetera-ledger`            | F2   | Ledger de doble entrada, saldo real y de bono, bloqueo de concurrencia            | Terminada |
| 004 | `004-depositos-payphone`          | F2   | Depósitos con Payphone sandbox y confirmación servidor a servidor                 | Terminada |
| 005 | `005-partidos-mercados`           | F3   | Partidos, máquina de estados, mercados y cuotas, gestión del operador             | Terminada |
| 006 | `006-sincronizacion-api-football` | F3   | Worker de API-Football con presupuesto diario y frecuencia adaptativa             | Terminada |
| 007 | `007-apuestas-simples-combinadas` | F4   | Boleto de apuesta, aceptación atómica, cuota congelada, límites                   | Pendiente |
| 008 | `008-liquidacion-tiempo-real`     | F5   | Liquidación idempotente, WebSocket, objetivo ≤ 5 s, re-liquidación auditada       | Pendiente |
| 009 | `009-suspensiones-aplazamientos`  | F5   | Plazo de reanudación, anulación y reembolso, cuota 1.00 en combinadas             | Pendiente |
| 010 | `010-promociones-cupones`         | F6   | Cupones, rollover y controles anti-abuso                                          | Pendiente |
| 011 | `011-retiros`                     | F6   | Retiros con 2FA, solo al mismo titular y revisión manual                          | Pendiente |
| 012 | `012-deteccion-fraude`            | F6   | Reglas de detección (cuentas múltiples, apuestas anómalas) y alertas              | Pendiente |
| 013 | `013-reportes-dashboard`          | F7   | Servicio de reportes en Python, dashboard y exportación CSV/PDF                   | Pendiente |

Al crear o cerrar una spec, actualiza su fila (Pendiente → En curso → Terminada).

## Asignación por Integrante y Flujo de Trabajo en Equipo

Para trabajar en modalidad colaborativa aplicando **SDD (Spec Kit)**, cada integrante toma una spec desde `develop` en su propia rama `feature/spec-X`:

| Integrante               | Rama             | Spec del catálogo                                             | Alcance principal                                                                             |
| ------------------------ | ---------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Líder del equipo         | `feature/spec-1` | `001-fundaciones-monorepo`                                    | Stack base del monorepo, CI/CD, Docker Compose y apps base (Terminada)                        |
| Integrante 2             | `feature/spec-2` | `002-autenticacion-roles`                                     | Registro, login JWT `httpOnly`, 2FA TOTP, RBAC (`bettor`, `operator`, `admin`) y auditoría    |
| Integrante 3             | `feature/spec-3` | `003-billetera-ledger` (+ `004-depositos-payphone`)           | Ledger de doble entrada inmutable, saldo real/bono, bloqueo de fila (`SELECT ... FOR UPDATE`) |
| Integrante 4             | `feature/spec-4` | `005-partidos-mercados` (+ `006-sincronizacion-api-football`) | CRUD partidos/mercados/cuotas, máquina de estados y worker API-Football                       |
| Integrante 5 (si aplica) | `feature/spec-5` | `007-apuestas-simples-combinadas`                             | Boleto simple/combinado, aceptación atómica, cuota congelada y límites                        |

### Pasos exactos al clonar el repositorio

1. Clonar e instalar dependencias desde la rama base `develop`:
   ```bash
   git clone https://github.com/CarlosValladares215/Apuestas_ArquitecturaSoftware.git
   cd Apuestas_ArquitecturaSoftware
   git checkout develop
   pnpm install
   ```
2. Crear la rama asignada desde `develop` (ejemplo para Integrante 2):
   ```bash
   git checkout -b feature/spec-2
   ```
3. Ejecutar el ciclo SDD completo con Spec Kit en la carpeta `specs/NNN-nombre/`:
   - `speckit-specify` → define `spec.md` (vectores de fraude, escenarios y criterios verificables).
   - `speckit-plan` → genera `plan.md`, `research.md`, `data-model.md`, `contracts/` y verifica `.specify/memory/constitution.md`.
   - `speckit-tasks` → desglosa `tasks.md` en orden de dependencias (pruebas primero en dominios críticos).
   - `speckit-implement` → implementa siguiendo TDD y las skills instaladas en `.agents/skills/` y `.claude/skills/`.
4. Verificar antes de subir:
   ```bash
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
   _(Si se modifica `apps/reports`, ejecutar también `ruff check .` y `pytest`.)_
5. Subir la rama y abrir **Pull Request hacia `develop`**:
   ```bash
   git push -u origin feature/spec-2
   ```
