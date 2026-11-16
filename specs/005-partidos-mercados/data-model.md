# Data Model: 005-partidos-mercados y 006-sincronizacion-api-football

## 1. Entidades de Dominio (`packages/shared` y `apps/api`)

### 1.1 `Competition` (Competición)

| Campo        | Tipo     | Obligatorio | Validación / Regla                                   |
| ------------ | -------- | ----------- | ---------------------------------------------------- |
| `id`         | `string` | Sí          | Identificador único (`comp_*` o UUID)                |
| `name`       | `string` | Sí          | Nombre oficial del torneo (p. ej. `LigaPro Serie A`) |
| `country`    | `string` | Sí          | País o confederación (`Ecuador`, `CONMEBOL`, `UEFA`) |
| `sport`      | `string` | Sí          | Deporte (`football` por defecto, diseño genérico)    |
| `externalId` | `number` | No          | ID de liga en API-Football                           |

### 1.2 `Match` (Partido)

| Campo           | Tipo              | Obligatorio | Validación / Regla                                                                       |
| --------------- | ----------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `id`            | `string`          | Sí          | Identificador único (`match_*` o UUID)                                                   |
| `competitionId` | `string`          | Sí          | Referencia a `Competition.id`                                                            |
| `competition`   | `Competition`     | Sí          | Datos de la competición asociada                                                         |
| `homeTeam`      | `string`          | Sí          | Nombre no vacío, distinto de `awayTeam`                                                  |
| `awayTeam`      | `string`          | Sí          | Nombre no vacío, distinto de `homeTeam`                                                  |
| `kickoffAt`     | `string`          | Sí          | Fecha/hora de inicio en ISO 8601 UTC                                                     |
| `status`        | `MatchStatus`     | Sí          | `'programado' \| 'en_vivo' \| 'finalizado' \| 'suspendido' \| 'aplazado' \| 'cancelado'` |
| `score`         | `MatchScore`      | Sí          | `{ home: number; away: number }` ($\ge 0$)                                               |
| `elapsedMinute` | `number \| null`  | No          | Minuto en curso cuando `status === 'en_vivo'`                                            |
| `externalId`    | `number`          | No          | ID de fixture en API-Football                                                            |
| `markets`       | `BettingMarket[]` | Sí          | Mercados asociados al partido                                                            |
| `updatedAt`     | `string`          | Sí          | Marca de tiempo ISO del servidor                                                         |

### 1.3 `BettingMarket` (Mercado)

| Campo          | Tipo                         | Obligatorio | Validación / Regla                                                                |
| -------------- | ---------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `id`           | `string`                     | Sí          | Identificador único (`mkt_*` o UUID)                                              |
| `matchId`      | `string`                     | Sí          | Referencia a `Match.id`                                                           |
| `type`         | `string`                     | Sí          | Clave de mercado (`match_winner_1x2`, `over_under_2_5`, `both_teams_score`, etc.) |
| `name`         | `string`                     | Sí          | Nombre legible (`Resultado Final (1X2)`, `Más/Menos 2.5 Goles`)                   |
| `isPreMatch`   | `boolean`                    | Sí          | Si es `true`, se cierra automáticamente al llegar `kickoffAt` del servidor        |
| `status`       | `MarketStatus`               | Sí          | `'open' \| 'closed' \| 'suspended'`                                               |
| `closedReason` | `MarketClosedReason \| null` | No          | `'match_started' \| 'match_status_changed' \| 'manual_operator' \| null`          |
| `selections`   | `MarketSelection[]`          | Sí          | Mínimo 2 selecciones por mercado                                                  |

### 1.4 `MarketSelection` (Selección y Cuota)

| Campo      | Tipo     | Obligatorio | Validación / Regla                                                         |
| ---------- | -------- | ----------- | -------------------------------------------------------------------------- |
| `id`       | `string` | Sí          | Identificador único (`sel_*` o UUID)                                       |
| `marketId` | `string` | Sí          | Referencia a `BettingMarket.id`                                            |
| `key`      | `string` | Sí          | Clave dentro del mercado (`HOME`, `DRAW`, `AWAY`, `OVER_2_5`, `UNDER_2_5`) |
| `label`    | `string` | Sí          | Etiqueta visible para el usuario                                           |
| `odds`     | `number` | Sí          | Cuota decimal redondeada a 2–4 decimales ($\ge 1.01$)                      |

### 1.5 `ApiFootballSyncStatus` (Presupuesto y Estado del Worker)

| Campo                   | Tipo                                                                             | Descripción                                                         |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `dateUtc`               | `string`                                                                         | Fecha UTC activa del contador (`YYYY-MM-DD`)                        |
| `dailyBudget`           | `number`                                                                         | Presupuesto total diario de peticiones (p. ej. `100`)               |
| `liveReserve`           | `number`                                                                         | Cupo reservado exclusivamente para partidos `en_vivo` (p. ej. `15`) |
| `usedToday`             | `number`                                                                         | Peticiones consumidas en el día UTC actual                          |
| `remainingToday`        | `number`                                                                         | Peticiones disponibles (`max(0, dailyBudget - usedToday)`)          |
| `activeLiveMatches`     | `number`                                                                         | Cantidad actual de partidos en estado `en_vivo`                     |
| `mode`                  | `'live_active' \| 'scheduled_only' \| 'reserve_protected' \| 'budget_exhausted'` | Modo adaptativo actual                                              |
| `recommendedIntervalMs` | `number \| null`                                                                 | Intervalo en ms hasta la siguiente consulta (`null` si agotado)     |
| `apiKeyConfigured`      | `boolean`                                                                        | Indica si el backend tiene clave configurada (sin exponer su valor) |
| `lastSyncAt`            | `string \| null`                                                                 | Marca de tiempo ISO de la última ejecución                          |
| `lastSyncOutcome`       | `'updated' \| 'skipped_budget' \| 'skipped_reserve' \| 'idle'`                   | Resultado del último ciclo                                          |

### 1.6 `MatchAuditEntry` (Auditoría Append-Only)

| Campo       | Tipo      | Descripción                                                                                             |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `id`        | `string`  | Identificador único de auditoría                                                                        |
| `timestamp` | `string`  | Marca de tiempo ISO generada por el reloj del servidor                                                  |
| `actorRole` | `AppRole` | Rol que ejecutó la acción (`operator` o `admin`)                                                        |
| `action`    | `string`  | Acción (`MATCH_CREATED`, `MATCH_STATUS_CHANGED`, `MARKET_CREATED`, `ODDS_UPDATED`, `API_FOOTBALL_SYNC`) |
| `matchId`   | `string`  | Partido asociado (o `'global'` en sincronización)                                                       |
| `details`   | `string`  | Resumen inmutable del cambio (estado previo → nuevo, cuota previa → nueva)                              |

---

## 2. Esquema Relacional PostgreSQL (`supabase-postgres-best-practices`)

Siguiendo las reglas de `supabase-postgres-best-practices` (tipos `numeric` exactos en lugar de `float`, `timestamptz`, índices en claves foráneas e índices parciales para consultas frecuentes):

```sql
CREATE TYPE match_status AS ENUM (
  'programado',
  'en_vivo',
  'finalizado',
  'suspendido',
  'aplazado',
  'cancelado'
);

CREATE TYPE market_status AS ENUM ('open', 'closed', 'suspended');

CREATE TABLE competitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL,
  sport text NOT NULL DEFAULT 'football',
  external_id integer UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id text PRIMARY KEY,
  competition_id text NOT NULL REFERENCES competitions (id) ON DELETE RESTRICT,
  home_team text NOT NULL,
  away_team text NOT NULL,
  kickoff_at timestamptz NOT NULL,
  status match_status NOT NULL DEFAULT 'programado',
  home_score integer NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score integer NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  elapsed_minute integer CHECK (elapsed_minute IS NULL OR elapsed_minute >= 0),
  external_id integer UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_distinct_teams CHECK (lower(home_team) <> lower(away_team))
);

CREATE INDEX idx_matches_competition_id ON matches (competition_id);
CREATE INDEX idx_matches_kickoff_at ON matches (kickoff_at);
CREATE INDEX idx_matches_live_partial ON matches (kickoff_at) WHERE status = 'en_vivo';

CREATE TABLE markets (
  id text PRIMARY KEY,
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  is_pre_match boolean NOT NULL DEFAULT true,
  status market_status NOT NULL DEFAULT 'open',
  closed_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_markets_match_id ON markets (match_id);

CREATE TABLE market_selections (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
  selection_key text NOT NULL,
  label text NOT NULL,
  odds numeric(10, 4) NOT NULL CHECK (odds >= 1.0100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, selection_key)
);

CREATE INDEX idx_market_selections_market_id ON market_selections (market_id);

CREATE TABLE api_football_daily_quota (
  date_utc date PRIMARY KEY,
  daily_budget integer NOT NULL CHECK (daily_budget > 0),
  live_reserve integer NOT NULL CHECK (live_reserve >= 0),
  used_today integer NOT NULL DEFAULT 0 CHECK (used_today >= 0),
  last_sync_at timestamptz,
  last_sync_outcome text NOT NULL DEFAULT 'idle'
);
```
