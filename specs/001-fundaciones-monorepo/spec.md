# Feature Specification: Fundaciones del Monorepo e Infraestructura Base

**Feature Branch**: `feature/spec-1`  
**Created**: 2026-11-14  
**Status**: Draft  
**Input**: Spec #1 (`001-fundaciones-monorepo`) — Fase F0 de `PLAN.md`: inicializar el monorepo con `apps/web`, `apps/api`, `apps/reports` y `packages/shared`, herramientas de calidad (ESLint, Prettier, TypeScript estricto, Ruff, Commitlint/Husky), Docker Compose local (PostgreSQL + Redis), pipeline CI/CD en GitHub Actions con SonarQube, plantillas de issues/PR y manifiestos de despliegue.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entorno Monorepo Unificado y Verificable (Priority: P1)

Como integrante del equipo de desarrollo, necesito clonar el repositorio, instalar dependencias una sola vez y ejecutar comandos unificados de build, lint, verificación de tipos y pruebas sobre `apps/web`, `apps/api`, `apps/reports` y `packages/shared` para comenzar a desarrollar las specs siguientes sin fricción de configuración.

**Why this priority**: Sin la estructura del monorepo y los scripts de verificación funcionando, ningún integrante del equipo puede desarrollar ni integrar los módulos de autenticación, billetera, partidos o reportes.

**Independent Test**: Se puede verificar ejecutando instalación de workspace, compilación, lint, verificación de tipos y pruebas unitarias de todas las aplicaciones y paquetes desde la raíz del repositorio.

**Acceptance Scenarios**:

1. **Given** un desarrollador recién clona el repositorio en `feature/spec-1` o `develop`, **When** ejecuta `pnpm install` y los comandos de workspace (`pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`), **Then** todos los paquetes TypeScript compilan sin errores y las pruebas base pasan.
2. **Given** el servicio de reportes en Python (`apps/reports`), **When** se ejecutan `ruff check` y `pytest`, **Then** el análisis estático y las pruebas de salud responden en verde.
3. **Given** un desarrollador intenta realizar un commit que no sigue Conventional Commits, **When** Commitlint valida el mensaje de commit, **Then** el commit es rechazado indicando el formato esperado.

---

### User Story 2 - Esqueletos Funcionales con Health Checks y UI Base (Priority: P1)

Como líder del proyecto y evaluador académico, necesito que las tres aplicaciones (`apps/web`, `apps/api`, `apps/reports`) arranquen localmente y expongan puntos de verificación de estado (`/health` y vista inicial accesible en web) para confirmar la arquitectura de tres servicios desde el primer sprint.

**Why this priority**: Cumple el criterio de entrega vertical de F0 ("hola mundo" de las tres apps verificable de punta a punta) respetando el Principio VI (exactamente tres aplicaciones) y el Principio VII (UI accesible desde 360 px).

**Independent Test**: Se verifica consultando `GET /health` en `apps/api` y `apps/reports`, y renderizando/probando la página inicial de `apps/web` junto con sus pruebas unitarias y de componentes.

**Acceptance Scenarios**:

1. **Given** el backend `apps/api` en ejecución o bajo prueba Supertest, **When** se realiza `GET /health`, **Then** responde HTTP `200` con estado `ok`, nombre del servicio, marca de tiempo ISO y versión compartida.
2. **Given** el servicio Python `apps/reports` en ejecución o bajo TestClient, **When** se realiza `GET /health`, **Then** responde HTTP `200` con estado `ok`, nombre del servicio `reports` y versión.
3. **Given** el frontend `apps/web`, **When** un usuario abre la vista inicial en móvil (360 px) o escritorio, **Then** visualiza el estado de la plataforma sin lógica de saldos ni cálculos financieros en el cliente y cumpliendo estructura semántica accesible.

---

### User Story 3 - Infraestructura Local, CI/CD y Gobernanza Git Flow (Priority: P2)

Como equipo colaborativo, necesitamos archivos de entorno de ejemplo, `docker-compose.yml` con PostgreSQL y Redis, flujo de GitHub Actions, configuración de SonarQube, manifiestos de despliegue (Vercel/Render) y plantillas de Issue/PR para que cada rama `feature/spec-X` pase las compuertas de calidad antes de integrarse a `develop`.

**Why this priority**: Automatiza el cumplimiento de la constitución del proyecto (calidad bloqueante, cero secretos en el repo, trazabilidad en PRs).

**Independent Test**: Se verifica validando la sintaxis de YAML/JSON, comprobando que no existan secretos reales en `.env.example` ni en el código, y verificando la ejecución local de la misma secuencia de pasos que define el workflow de CI.

**Acceptance Scenarios**:

1. **Given** un desarrollador levanta servicios locales, **When** inspecciona `docker-compose.yml` y `.env.example`, **Then** dispone de PostgreSQL 16 y Redis 7 con variables documentadas y sin credenciales productivas expuestas.
2. **Given** un desarrollador abre un Pull Request hacia `develop` o `main`, **When** se dispara `.github/workflows/ci.yml`, **Then** ejecuta lint, typecheck, pruebas TypeScript y Python, y análisis SonarQube usando la plantilla oficial de PR.

---

### Edge Cases

- ¿Qué ocurre si un archivo de entorno `.env` local existe en la máquina del desarrollador? El `.gitignore` debe impedir su inclusión en el repositorio mientras permite `.env.example`.
- ¿Qué ocurre si `apps/web` intenta calcular saldos o importar lógica de backend? El paquete `packages/shared` solo exporta tipos, constantes de dominio y utilidades puras no financieras (sin acceso a BD ni secretos).
- ¿Qué ocurre si un desarrollador ejecuta comandos en Windows o Linux? Los scripts de raíz (`pnpm`) y Python deben ser portables entre plataformas sin depender exclusivamente de sintaxis Unix.
- ¿Qué ocurre si `apps/api` o `apps/reports` reciben variables de entorno faltantes en pruebas de `/health`? Deben responder correctamente en modo base sin requerir conexión activa obligatoria a servicios externos para el endpoint de vida básica (`/health`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El repositorio DEBE estructurarse como monorepo con `pnpm` workspaces y Turborepo conteniendo exactamente las tres aplicaciones constitucionales (`apps/web`, `apps/api`, `apps/reports`) y el paquete compartido (`packages/shared`).
- **FR-002**: El workspace DEBE configurar TypeScript estricto (`strict: true`), ESLint y Prettier para proyectos JS/TS, y Ruff para Python (`apps/reports`).
- **FR-003**: El repositorio DEBE configurar Husky y Commitlint para exigir mensajes con formato Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `ci:`).
- **FR-004**: `apps/api` (NestJS) DEBE exponer `GET /health` devolviendo JSON estructurado con estado del servicio y encabezados básicos de seguridad (`helmet`) y validación global (`ValidationPipe`).
- **FR-005**: `apps/reports` (FastAPI + pandas) DEBE exponer `GET /health` devolviendo JSON estructurado y estar configurado con `pyproject.toml` compatible con `uv` y `pytest`.
- **FR-006**: `apps/web` (Next.js App Router) DEBE renderizar una página principal responsiva (desde 360 px) y accesible (semántica HTML, contraste, foco visible) sin exponer claves ni calcular dinero.
- **FR-007**: El repositorio DEBE incluir `docker-compose.yml` con PostgreSQL 16 y Redis 7 para desarrollo local, junto con `.env.example` sin valores secretos reales.
- **FR-008**: El repositorio DEBE incluir pipeline CI en `.github/workflows/ci.yml`, configuración `sonar-project.properties`, manifiestos base de despliegue (`render.yaml`, `apps/web/vercel.json`) y plantillas en `.github/ISSUE_TEMPLATE/` y `.github/pull_request_template.md`.
- **FR-009**: Los vectores de fraude/seguridad aplicables a esta fase base (exposición accidental de secretos, cabeceras HTTP inseguras, validación de entrada desactivada, mezcla de lógica de reportes con escritura en BD) DEBEN quedar mitigados desde la configuración inicial (`.gitignore`, `.env.example`, `helmet`, `ValidationPipe` con `whitelist: true` y `forbidNonWhitelisted: true`, usuario de solo lectura documentado para `apps/reports`).
- **FR-010**: La documentación `CLAUDE.md` y `specs/README.md` DEBEN actualizarse con los comandos reales del monorepo y el estado de la Spec `001-fundaciones-monorepo`.

### Key Entities *(include if feature involves data)*

- **HealthStatus**: Contrato compartido de respuesta de salud (`status`, `service`, `version`, `timestamp`) definido en `packages/shared` y consumido por los endpoints `/health`.
- **AppRole**: Enumeración base compartida de roles del sistema (`bettor`, `operator`, `admin`) alineada con la especificación funcional para uso consistente en futuras specs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% de los paquetes TypeScript (`packages/shared`, `apps/api`, `apps/web`) pasan `lint`, `typecheck`, `build` y `test` ejecutados desde la raíz con `pnpm`.
- **SC-002**: 100% del código Python en `apps/reports` pasa `ruff check` y `pytest` en verde.
- **SC-003**: Los endpoints `GET /health` de `apps/api` y `apps/reports` responden HTTP `200` con esquema validado mediante pruebas automatizadas.
- **SC-004**: `apps/web` pasa pruebas de renderizado y accesibilidad estructural básica (encabezados, landmarks, navegación por teclado y ancho mínimo 360 px) en verde.
- **SC-005**: Cero secretos o archivos `.env` rastreados en Git; `docker-compose.yml`, `.github/workflows/ci.yml` y plantillas de GitHub validados.

## Assumptions

- Las credenciales externas de **Vercel**, **Render**, **SonarQube Cloud** y **Grafana Cloud** no se almacenan en el repositorio y deben conectarse desde los paneles/secrets de GitHub de la organización/autor tras el merge.
- No se implementan todavía tablas de negocio de usuarios, billetera ni apuestas (pertenecen a las Specs 002–007).
- `pnpm` (v10/12) y Node.js 24 + Python 3.12 están disponibles en el entorno local y en CI.
