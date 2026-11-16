# Quickstart: 003-billetera-ledger

## Requisitos previos

- Node.js 22+ o 24+
- `pnpm` 10+ (o 12+)
- Docker Compose (opcional para PostgreSQL y Redis locales)

## Puesta en marcha rápida

1. **Variables de entorno**
   Verifica que `.env` contenga las variables requeridas para la billetera y Payphone Sandbox:

   ```bash
   cp .env.example .env
   ```

   Variables clave en `apps/api`:
   - `PAYPHONE_TOKEN`: Token de autenticación del comercio en Payphone Sandbox.
   - `PAYPHONE_CLIENT_ID`: Identificador de cliente Payphone Sandbox.
   - `PAYPHONE_APP_ID`: Identificador de aplicación Payphone.

2. **Compilar contratos compartidos**

   ```bash
   pnpm --filter @apuestas/shared build
   ```

3. **Ejecutar pruebas TDD de Billetera y Ledger**
   Para verificar la suite completa de concurrencia, idempotencia y antifraude:

   ```bash
   # Pruebas en apps/api
   pnpm --filter @apuestas/api test

   # Pruebas de concurrencia e idempotencia específicas
   pnpm --filter @apuestas/api test -- wallet

   # Pruebas de UI en apps/web
   pnpm --filter @apuestas/web test -- wallet
   ```

4. **Verificación completa del monorepo**

   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

5. **Levantar las aplicaciones en desarrollo**
   ```bash
   pnpm dev
   ```
   - Frontend: `http://localhost:3000/wallet`
   - API: `http://localhost:3001/api/v1/wallet`

## Flujo de Prueba Manual del Depósito Payphone Sandbox

1. Ingresa a `http://localhost:3000/wallet`.
2. Observa el saldo real inicial (\$0.00) y de bono (\$0.00).
3. En el formulario "Recargar Saldo", ingresa un monto (ej. `25.00`) y presiona "Iniciar Depósito".
4. El sistema genera la intención de pago `PENDING` en el backend y presenta el identificador de transacción y el enlace de simulación Payphone.
5. Al confirmarse el pago servidor a servidor, el saldo se actualiza a \$25.00 y aparece el nuevo asiento contable en la tabla de movimientos.
