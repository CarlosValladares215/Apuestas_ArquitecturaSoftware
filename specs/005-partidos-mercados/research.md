# Research: 005-partidos-mercados y 006-sincronizacion-api-football

## Decisiones técnicas investigadas y validadas

### 1. Máquina de Estados del Partido Determinista (`packages/shared` + `apps/api`)

- **Decisión**: Definir la tabla explícita de transiciones `MATCH_STATE_TRANSITIONS` en `@apuestas/shared` y aplicarla obligatoriamente en `MatchesService.transitionStatus()`:
  - `programado` → `['en_vivo', 'suspendido', 'aplazado', 'cancelado']`
  - `en_vivo` → `['finalizado', 'suspendido', 'aplazado', 'cancelado']`
  - `suspendido` → `['en_vivo', 'aplazado', 'cancelado']`
  - `aplazado` → `['programado', 'en_vivo', 'cancelado']`
  - `finalizado` → `[]` (terminal)
  - `cancelado` → `[]` (terminal)
- **Razón**: Evita transiciones ambiguas o fraudulentas (como reabrir un partido `finalizado` o `cancelado`, o finalizar un partido `programado` sin haber pasado por `en_vivo`). Al estar en `@apuestas/shared`, el contrato es compartido y testeable de forma pura.
- **Alternativas descartadas**: Permitir que el operador sobrescriba libremente el campo `status` sin validar el estado previo (viola Principio I y III).

### 2. Cierre Automático de Mercados Pre-Partido con Reloj del Servidor (`CLOCK_PORT`)

- **Decisión**: Inyectar un proveedor `CLOCK_PORT` (`ServerClock`) en `MatchesService` y evaluar en cada lectura y mutación si `serverClock.now().getTime() >= Date.parse(match.kickoffAt)` o `match.status !== 'programado'`. Cuando se cumple cualquiera de las dos condiciones, todo mercado con `isPreMatch: true` e estado `open` pasa automáticamente a `closed` con `closedReason: 'match_started'` (o `'match_status_changed'`), y se bloquea cualquier intento de actualizar sus cuotas o reabrirlo como pre-partido.
- **Razón**: Cumple el Principio III ("Las reglas temporales —cierre de mercado al inicio del partido— se evalúan con el reloj del servidor") y permite pruebas deterministas en TDD manipulando el reloj del servidor sin usar `setTimeout` frágiles.
- **Alternativas descartadas**: Confiar en un flag enviado por el cliente o depender únicamente de un cron periódico que podría ejecutarse con segundos de retraso respecto al `kickoffAt`.

### 3. Presupuesto Diario y Frecuencia Adaptativa para API-Football (`006-sincronizacion-api-football`)

- **Decisión**: Implementar `ApiFootballSyncService` con control de presupuesto diario en UTC (`dailyBudget`, por defecto `100` req/día; `liveReserve`, por defecto `15` req reservadas para partidos `en_vivo`):
  - **Modo `live_active`** (cuando hay $\ge 1$ partido en `en_vivo` y queda presupuesto): frecuencia alta cada `60_000 ms` (1 minuto).
  - **Modo `scheduled_only`** (cuando no hay partidos en `en_vivo` y `remainingToday > liveReserve`): frecuencia espaciada cada `1_800_000 ms` (30 minutos).
  - **Modo `reserve_protected`** (cuando no hay partidos en `en_vivo` y `remainingToday <= liveReserve`): se pospone el refresco de cartelera futura para preservar las últimas peticiones del día por si inicia un partido en vivo.
  - **Modo `budget_exhausted`** (cuando `remainingToday === 0`): `0` llamadas externas hasta el siguiente día UTC (`00:00:00Z`).
- **Razón**: Resuelve directamente el riesgo #1 de `PLAN.md` ("Cuota baja del plan gratuito de API-Football: un único worker con presupuesto diario, caché y modo de simulación de partidos para la demo").
- **Alternativas descartadas**: Consultar API-Football desde `apps/web` o con un `setInterval` fijo de 30 segundos las 24 horas (agotaría las 100 peticiones diarias en 50 minutos y expondría la API key).

### 4. Diseño de Esquema PostgreSQL (`supabase-postgres-best-practices`)

- **Decisión**: Especificar en `data-model.md` el DDL de PostgreSQL 16 usando `numeric(10,4)` para cuotas (con `CHECK (odds >= 1.01)`), `timestamptz` en UTC para todas las fechas, claves foráneas con índices explícitos (`idx_matches_competition_id`, `idx_markets_match_id`, `idx_selections_market_id`) y un índice parcial `idx_matches_live` (`WHERE status = 'en_vivo'`) para acelerar el escaneo del worker en vivo.
- **Razón**: Sigue las reglas `schema-`, `query-missing-indexes` y `query-partial-indexes` de `supabase-postgres-best-practices`.

### 5. UI Mobile-First y Accesible (`frontend-design` + `vercel-react-best-practices`)

- **Decisión**: Diseñar la cartelera deportiva en `apps/web` siguiendo una estética de marcador editorial de alta legibilidad:
  - Paleta anclada en los tokens del proyecto (`--bg-canvas: #f6f7f4`, `--bg-surface: #ffffff`, `--ink-primary: #101923`, `--accent-pitch: #0f766e`, más semánticos de alto contraste para `en_vivo`, `suspendido` y `cerrado`).
  - Tipografía `Plus Jakarta Sans` para nombres de equipos y mercados e `IBM Plex Mono` con `font-variant-numeric: tabular-nums` para marcadores, horas UTC y cuotas decimales.
  - Layout fluido desde `360px` (una columna en móvil con selector compacto de estado y competición; rejilla maestro-detalle en escritorio $\ge 860\text{px}$).
- **Razón**: Cumple el Principio VII de la Constitución y evita los anti-patrones visuales genéricos señalados en `frontend-design`.
