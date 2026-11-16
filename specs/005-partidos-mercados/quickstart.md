# Quickstart: 005-partidos-mercados y 006-sincronizacion-api-football

## 1. Preparar variables de entorno e instalar dependencias

```bash
cp .env.example .env
pnpm install
```

## 2. Ejecutar pruebas por paquete (TDD)

```bash
# Reglas compartidas de máquina de estados, bloqueo de mercados y cuota de API-Football
pnpm --filter @apuestas/shared test

# Pruebas unitarias y de integración E2E en NestJS (partidos, mercados, RBAC, worker API-Football)
pnpm --filter @apuestas/api test

# Pruebas de cartelera y detalle de mercados en Next.js (accesibilidad y 360px)
pnpm --filter @apuestas/web test
```

## 3. Verificación completa del monorepo (secuencia CI)

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 4. Probar endpoints de Partidos, Mercados y Worker API-Football en local

Con `pnpm dev` en marcha (`apps/api` en `http://localhost:3001` y `apps/web` en `http://localhost:3000`):

```bash
# 1. Consultar cartelera pública
curl http://localhost:3001/matches

# 2. Consultar estado del presupuesto diario del worker API-Football
curl http://localhost:3001/matches/sync/status

# 3. Crear un partido manualmente como operador
curl -X POST http://localhost:3001/matches \
  -H "Content-Type: application/json" \
  -H "x-user-role: operator" \
  -d '{
    "competitionId": "comp_ligapro",
    "competitionName": "LigaPro Serie A",
    "country": "Ecuador",
    "homeTeam": "LDU Quito",
    "awayTeam": "Independiente del Valle",
    "kickoffAt": "2027-02-15T20:00:00.000Z"
  }'

# 4. Ejecutar un ciclo del worker de sincronización como operador
curl -X POST http://localhost:3001/matches/sync/run \
  -H "Content-Type: application/json" \
  -H "x-user-role: operator" \
  -d '{"purpose": "live"}'
```
