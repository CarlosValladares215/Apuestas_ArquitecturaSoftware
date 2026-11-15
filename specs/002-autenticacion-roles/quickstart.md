# Quickstart: 002-autenticacion-roles

## Variables de entorno adicionales (`.env.example`)
- `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` (mínimo 32 caracteres).
- `JWT_ACCESS_TTL_SECONDS=900` (15 min) y `JWT_REFRESH_TTL_DAYS=7`.
- `TOTP_ENCRYPTION_KEY` (clave de 32 bytes hex/UTF-8 para cifrar secretos TOTP en reposo).
- `CAPTCHA_PROVIDER=mock` (en desarrollo/tests; usar `turnstile` + `CAPTCHA_SECRET_KEY` en staging/producción).
- `AUTH_STORAGE_DRIVER=auto` (`auto` usa Prisma/PostgreSQL cuando `DATABASE_URL` está configurada fuera de `NODE_ENV=test`, o `memory` en pruebas unitarias/e2e sin BD).

## Comandos con PostgreSQL (Docker o Render)
```bash
cd apps/api
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec prisma migrate deploy
```

## Verificación de Spec 002 (sin requerir Docker local)
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
