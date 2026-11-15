# Quickstart: 001-fundaciones-monorepo

## Requisitos previos

- Node.js 24+ y `pnpm` 10+ (o Corepack habilitado)
- Python 3.12+ (`uv` recomendado o `pip`)
- Docker Desktop / Docker Engine (para PostgreSQL y Redis locales)

## Puesta en marcha local

1. **Variables de entorno**

   ```bash
   cp .env.example .env
   ```

2. **Infraestructura local (PostgreSQL + Redis)**

   ```bash
   docker compose up -d
   ```

3. **Instalar dependencias JS/TS y compilar paquete compartido**

   ```bash
   pnpm install
   pnpm --filter @apuestas/shared build
   ```

4. **Instalar dependencias Python (`apps/reports`)**
   Con `uv`:

   ```bash
   cd apps/reports && uv sync --extra dev
   ```

   O con `pip`:

   ```bash
   cd apps/reports && python -m pip install -e ".[dev]"
   ```

5. **Ejecutar verificaciones completas (misma secuencia que CI)**

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

   Y en `apps/reports`:

   ```bash
   ruff check .
   pytest
   ```

6. **Arrancar las tres apps en desarrollo**
   ```bash
   pnpm dev
   # y en otra terminal para reportes:
   cd apps/reports && uvicorn app.main:app --reload --port 8000
   ```

## Configuración externa pendiente del líder (una sola vez en cuentas cloud)

- Conectar `apps/web` en **Vercel** (Root Directory: `apps/web`, ramas `develop` → preview/staging y `main` → producción).
- Conectar `apps/api` y `apps/reports` + PostgreSQL + Redis en **Render** usando `render.yaml`.
- Crear proyecto en **SonarQube Cloud** y registrar `SONAR_TOKEN` en GitHub Secrets.
- Activar protección de ramas `main` y `develop` en GitHub (PR obligatorio + check de CI).
- Conectar **Grafana Cloud** con el datasource de GitHub para métricas DORA.
