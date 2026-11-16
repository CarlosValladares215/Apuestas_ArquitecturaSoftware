# Feature Specification: Partidos, Mercados y Sincronización con API-Football

**Feature Branch**: `feature/spec-4`  
**Created**: 2026-11-15  
**Status**: Draft  
**Input**: Specs `005-partidos-mercados` y `006-sincronizacion-api-football` — Fase F3 de `PLAN.md`: modelo de competición, partido, mercado, selección y cuota; máquina de estados del partido (`programado → en_vivo → finalizado`, `suspendido`, `aplazado`, `cancelado`); cierre automático de mercados pre-partido al iniciar el partido según el reloj del servidor; CRUD de operador para partidos, mercados y cuotas manuales; worker en `apps/api` de sincronización con API-Football con presupuesto diario de peticiones y frecuencia adaptativa; y cartelera/detalle de mercados en `apps/web` mobile-first desde 360 px y WCAG 2.1 AA.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Máquina de Estados del Partido y Cierre Automático de Mercados Pre-Partido (Priority: P1)

Como apostador y sistema de integridad deportiva, necesito que cada partido gestione su ciclo de vida mediante una máquina de estados estricta (`programado → en_vivo → finalizado`, además de `suspendido`, `aplazado` y `cancelado`) y que todos los mercados pre-partido se cierren automáticamente en el instante en que el reloj del servidor alcanza la hora de inicio del partido o este cambia de `programado`, para impedir apuestas con ventaja temporal (_past-posting_).

**Why this priority**: Es una invariante constitucional de seguridad antifraude (Principios I y III): ninguna apuesta pre-partido puede aceptarse tras el inicio del evento evaluado con el reloj del servidor, ni un partido finalizado o cancelado puede reabrirse arbitrariamente.

**Independent Test**: Se verifica mediante pruebas unitarias y de integración que evalúan todas las transiciones válidas e inválidas de estado de un partido y comprueban que un mercado pre-partido pasa a bloqueado/cerrado en cuanto `serverClock.now() >= match.kickoffAt` o cuando el estado deja de ser `programado`.

**Acceptance Scenarios**:

1. **Given** un partido en estado `programado` con hora de inicio futura según el reloj del servidor, **When** el partido avanza a `en_vivo` y posteriormente a `finalizado`, **Then** las transiciones son aceptadas y registradas con marca de tiempo del servidor.
2. **Given** un partido en estado terminal (`finalizado` o `cancelado`) o que intenta saltar de `programado` directamente a `finalizado`, **When** se solicita dicha transición, **Then** el sistema rechaza la operación con un error de dominio e impide alterar el estado.
3. **Given** un partido `programado` con mercados pre-partido abiertos cuya hora `kickoffAt` ya fue alcanzada o superada según el reloj del servidor (`serverNow >= kickoffAt`), **When** se consulta el partido o se intenta modificar/operar sobre un mercado pre-partido, **Then** el mercado aparece cerrado automáticamente (`status: 'closed'`) y rechaza cualquier intento de reapertura pre-partido.

---

### User Story 2 - Gestión de Operador (CRUD de Partidos, Mercados y Cuotas Manuales) (Priority: P1)

Como operador o administrador autenticado de la plataforma, necesito crear y actualizar competiciones, partidos, mercados y cuotas manuales, así como gestionar transiciones de suspensión, aplazamiento o cancelación dejando trazabilidad en el registro de auditoría inmutable.

**Why this priority**: El plan gratuito de API-Football puede no incluir cuotas en vivo para todas las ligas; el operador necesita configurar partidos, mercados y cuotas manuales bajo control de acceso por rol (RBAC) y con auditoría append-only (Principio I).

**Independent Test**: Se verifica ejecutando peticiones HTTP a los endpoints de operador con rol `operator`/`admin` (que deben tener éxito y generar entradas de auditoría) y con rol `bettor` o sin rol (que deben ser rechazadas con HTTP `403 Forbidden`).

**Acceptance Scenarios**:

1. **Given** un usuario con rol `operator` o `admin`, **When** crea un partido con su competición, equipos, fecha de inicio ISO y mercados iniciales con selecciones y cuotas válidas ($\ge 1.01$), **Then** el servidor persiste el partido, valida los datos de entrada y añade un asiento en el registro de auditoría append-only.
2. **Given** un usuario con rol `bettor` o una solicitud no autorizada, **When** intenta crear un partido, cambiar su estado o modificar cuotas manuales, **Then** el backend deniega el acceso por defecto con HTTP `403 Forbidden` y no modifica ningún dato.
3. **Given** un partido en estado `programado` antes de la hora de inicio del servidor, **When** el operador actualiza manualmente la cuota de una selección a un valor válido ($\ge 1.01$), **Then** la nueva cuota queda vigente en el servidor y se audita el valor anterior y el nuevo.

---

### User Story 3 - Sincronización Automática con API-Football y Presupuesto Diario (Priority: P2)

Como administrador técnico de la plataforma, necesito un único worker en el backend (`apps/api`) que consulte API-Football respetando un presupuesto diario máximo de peticiones, reserve cuota para partidos en vivo y ajuste su frecuencia de forma adaptativa (alta frecuencia solo cuando hay partidos `en_vivo`, baja frecuencia cuando solo hay partidos `programado`), manteniendo la `API_FOOTBALL_KEY` exclusivamente en el backend.

**Why this priority**: Cumple el Principio V (Tiempo real confiable) y mitiga el riesgo principal documentado en `PLAN.md`: agotar la cuota diaria del plan gratuito de API-Football o exponer la clave en el cliente.

**Independent Test**: Se verifica simulando ciclos de sincronización con distintos niveles de consumo del presupuesto diario (`usedToday`, `dailyBudget`, `liveReserve`) y comprobando el intervalo adaptativo calculado, el bloqueo preventivo al agotar el presupuesto y la ausencia total de `API_FOOTBALL_KEY` en respuestas HTTP y en `apps/web`.

**Acceptance Scenarios**:

1. **Given** existen partidos en estado `en_vivo` y presupuesto diario disponible, **When** el worker evalúa la planificación de sincronización, **Then** selecciona el intervalo de alta frecuencia (p. ej. 60 s) e importa los cambios de marcador y estado desde el proveedor externo actualizando los partidos correspondientes.
2. **Given** no existen partidos `en_vivo` y solo hay partidos `programado`, **When** el worker calcula su siguiente ejecución, **Then** aplica el intervalo espaciado de baja frecuencia (p. ej. 30 min) y si el presupuesto restante entra en la zona de reserva para vivo (`remaining <= liveReserve`), pospone la sincronización de cartelera general para proteger los partidos en vivo.
3. **Given** el contador diario alcanza el límite `dailyBudget`, **When** se solicita una nueva sincronización externa, **Then** el worker no realiza la petición HTTP a API-Football, devuelve estado protegido `daily_budget_exhausted` y registra el evento sin degradar la disponibilidad de la API.

---

### User Story 4 - Cartelera de Partidos y Detalle de Mercados Accesible en Web (Priority: P2)

Como apostador que navega desde móvil (360 px) o escritorio, necesito visualizar la cartelera de partidos filtrable por estado y competición, inspeccionar el detalle de mercados y selecciones con sus cuotas actuales y distinguir claramente qué mercados están abiertos y cuáles están cerrados por inicio o suspensión del partido.

**Why this priority**: Entrega el valor visible de la Fase F3 al usuario final cumpliendo los Principios III (solo presentación, sin cálculos ni llamadas directas a API-Football) y VII (mobile-first desde 360 px, WCAG 2.1 AA, skill `frontend-design`).

**Independent Test**: Se verifica con pruebas de componentes en React Testing Library validando landmarks semánticos, filtros por estado, cambio de partido activo en el panel de detalle de mercados, estado deshabilitado (`disabled`) de selecciones en mercados cerrados y ausencia de secretos en el DOM.

**Acceptance Scenarios**:

1. **Given** un usuario abre la cartelera en una pantalla de 360 px de ancho o superior, **When** explora la lista de partidos, **Then** visualiza competición, equipos, marcador, estado semántico y cuotas principales en tipografía tabular legible sin desbordamiento horizontal.
2. **Given** un usuario filtra la cartelera por estado (`En vivo`, `Programados`, `Suspendidos / Aplazados`, `Finalizados`) o selecciona un partido específico, **When** interactúa con los controles accesibles por teclado, **Then** la lista y el panel de detalle de mercados se actualizan mostrando todas las selecciones del partido elegido.
3. **Given** un partido cuyo reloj de inicio ya pasó o que se encuentra en estado `en_vivo`, `suspendido` o `finalizado`, **When** se muestran sus mercados pre-partido en la UI, **Then** los botones de cuota aparecen deshabilitados con indicación explícita `"Mercado cerrado"` Explicando el motivo.

---

### Edge Cases

- **Petición de cuota o apertura pre-partido exactamente en el segundo de inicio (`serverNow === kickoffAt`)**: Se considera iniciado; el mercado pre-partido se cierra automáticamente (`serverNow >= kickoffAt`).
- **Intento de configurar una cuota menor a `1.01`, `NaN` o negativa**: El backend rechaza la petición con HTTP `400 Bad Request` antes de tocar el almacenamiento.
- **Reinicio de presupuesto diario de API-Football al cambiar de día UTC**: Si la fecha UTC actual (`YYYY-MM-DD`) difiere de la fecha del último ciclo contabilizado, el contador `usedToday` se reinicia automáticamente a `0`.
- **Partido suspendido o aplazado**: Al pasar de `programado` o `en_vivo` a `suspendido` o `aplazado`, todos sus mercados activos pasan inmediatamente a estado `suspended`/`closed` para impedir nuevas apuestas mientras se resuelve la reanudación o cancelación (Spec 009).
- **Caída o falta de clave externa de API-Football en entorno local/CI**: El worker soporta un adaptador determinista/simulado cuando no se provee conexión externa real, permitiendo importar la cartelera del día en staging/demo y en pruebas automatizadas sin fallar.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE modelar Competiciones (`Competition`), Partidos (`Match`), Mercados (`BettingMarket`), Selecciones (`MarketSelection`) y Cuotas decimales (`odds >= 1.01`).
- **FR-002**: El sistema DEBE aplicar la máquina de estados del partido con los estados `programado`, `en_vivo`, `finalizado`, `suspendido`, `aplazado` y `cancelado`, rechazando cualquier transición no permitida.
- **FR-003**: El backend DEBE evaluar el cierre automático de mercados pre-partido usando exclusivamente el reloj del servidor (`serverNow >= Date.parse(match.kickoffAt)` o `match.status !== 'programado'`).
- **FR-004**: El backend DEBE exponer endpoints de lectura pública (`GET /matches`, `GET /matches/:id`) y endpoints protegidos por rol `operator`/`admin` (`POST /matches`, `PATCH /matches/:id/status`, `POST /matches/:id/markets`, `PATCH /matches/:id/markets/:marketId/odds`, `POST /matches/sync/run`, `GET /matches/sync/status`).
- **FR-005**: Toda mutación de operador o ejecución de sincronización DEBE registrarse en una bitácora de auditoría append-only (`MatchAuditEntry`) indicando actor, rol, acción, entidad afectada, marca de tiempo del servidor y resumen del cambio.
- **FR-006**: El worker de sincronización con API-Football en `apps/api` DEBE gestionar un presupuesto diario de peticiones (`dailyBudget`), reservar un cupo mínimo (`liveReserve`) exclusivo para partidos `en_vivo` y calcular un intervalo de consulta adaptativo según haya o no partidos en vivo.
- **FR-007**: La credencial `API_FOOTBALL_KEY` DEBE residir únicamente en variables de entorno del backend; ni el frontend (`apps/web`) ni las respuestas de la API pueden exponerla ni invocar a API-Football desde el navegador.
- **FR-008**: La interfaz en `apps/web` DEBE presentar la cartelera de partidos, filtros por estado/competición, estado del presupuesto de sincronización y vista detallada de mercados y selecciones cumpliendo diseño mobile-first desde 360 px y accesibilidad WCAG 2.1 AA (`frontend-design`).
- **FR-009**: Los vectores de fraude específicos de este dominio (_past-posting_ o apostar tras el inicio manipulando el reloj del cliente, alteración no autorizada de cuotas/estados por apostadores, agotamiento malicioso de cuota de API-Football mediante llamadas repetidas y exposición de API keys) DEBEN quedar mitigados por diseño en el servidor.

### Key Entities _(include if feature involves data)_

- **Competition**: Torneo o liga deportiva (`id`, `name`, `country`, `sport`, `externalId`).
- **Match**: Evento deportivo entre equipo local y visitante (`id`, `competitionId`, `homeTeam`, `awayTeam`, `kickoffAt`, `status`, `score`, `externalId`, `markets`, `updatedAt`).
- **BettingMarket**: Mercado de apuesta asociado a un partido (`id`, `matchId`, `type`, `name`, `isPreMatch`, `status`, `closedReason`, `selections`).
- **MarketSelection**: Opción dentro de un mercado con su cuota vigente (`id`, `marketId`, `key`, `label`, `odds`).
- **ApiFootballSyncStatus**: Estado operativo y contable del presupuesto diario del worker (`dateUtc`, `dailyBudget`, `liveReserve`, `usedToday`, `remainingToday`, `recommendedIntervalMs`, `mode`, `lastSyncAt`, `lastSyncOutcome`).
- **MatchAuditEntry**: Registro inmutable de auditoría de cambios sobre partidos, mercados, cuotas y sincronizaciones.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% de las transiciones inválidas de estado de partido son rechazadas en pruebas unitarias y de integración.
- **SC-002**: 100% de los mercados pre-partido cuyos partidos han alcanzado o superado la hora `kickoffAt` del servidor aparecen cerrados (`closed`) y rechazan modificaciones de cuota o reapertura pre-partido.
- **SC-003**: El worker de API-Football realiza `0` peticiones externas adicionales una vez alcanzado `dailyBudget` y reduce automáticamente la frecuencia cuando no existen partidos `en_vivo`.
- **SC-004**: 100% de los endpoints de escritura rechazan con HTTP `403` las solicitudes sin rol `operator` o `admin`.
- **SC-005**: La cartelera y el detalle de mercados en `apps/web` pasan todas las pruebas de componentes, accesibilidad semántica y diseño responsivo desde 360 px, y el monorepo supera `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`.

## Assumptions

- Mientras la Spec `002-autenticacion-roles` se desarrolla en paralelo por el Integrante 2, el guard de autorización de operador en `apps/api` valida el rol a través de la cabecera autenticada / contexto de usuario (`x-user-role` / `req.user.role`) con denegación por defecto (`403 Forbidden`), permitiendo integración inmediata con el guard JWT definitivo.
- Para que las pruebas unitarias, E2E y el pipeline de CI se ejecuten de forma determinista y sin depender de una clave comercial activa de API-Football, el worker utiliza un puerto inyectable (`ApiFootballProviderPort`) con un adaptador seguro que respeta `API_FOOTBALL_KEY` en entorno real y provee fixtures realistas en modo sandbox/test.
