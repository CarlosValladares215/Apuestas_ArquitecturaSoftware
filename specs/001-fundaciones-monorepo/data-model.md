# Data Model: 001-fundaciones-monorepo

En la Spec 001 (Fase F0) no se crean tablas de negocio en PostgreSQL (usuarios, billetera, ledger, partidos ni apuestas pertenecen a las Specs 002–007). Se definen los contratos de datos compartidos iniciales en `packages/shared` y la verificación de conectividad base.

## Entidades compartidas (`packages/shared`)

### 1. `HealthStatus`
Contrato común para respuestas `/health` en `apps/api` y `apps/reports`.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `status` | `'ok' \| 'degraded'` | Sí | Estado operativo del servicio |
| `service` | `'api' \| 'reports' \| 'web'` | Sí | Identificador del servicio |
| `version` | `string` | Sí | Versión semántica del monorepo (`0.1.0`) |
| `timestamp` | `string` (ISO 8601) | Sí | Fecha/hora del servidor en UTC |

### 2. `AppRole`
Enumeración compartida para el control de acceso (RBAC) que usarán `apps/api`, `apps/reports` y `apps/web` desde Spec 002.

| Valor | Descripción |
|---|---|
| `bettor` | Apostador |
| `operator` | Operador de partidos, mercados y promociones |
| `admin` | Administrador con acceso total, auditoría y reportes |

## Infraestructura de datos local (`docker-compose.yml`)

- **PostgreSQL 16**: servicio `postgres` en puerto `5432` con volumen persistente y healthcheck `pg_isready`.
- **Redis 7**: servicio `redis` en puerto `6379` con persistencia AOF y healthcheck `redis-cli ping`.
