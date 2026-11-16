# Implementation Plan: Shell de Navegación por Roles, Sidebar con Íconos y Footer

**Branch**: `feature/014-navegacion-roles-shell` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/014-navegacion-roles-shell/spec.md`

## Summary

Rediseñar la envolvente global de `apps/web` aplicando `frontend-design` y `vercel-react-best-practices`: introducir un `SessionProvider` reactivo en `RootLayout` apoyado en `GET /auth/me` y `POST /auth/logout` con cookies `httpOnly`, sustituir el header de 8 píldoras en `SiteHeader.tsx` por un `AppShell` responsivo (`Topbar` con badge visible de rol/sesión + `SiteSidebar` oscuro con íconos SVG agrupado por rol + `SiteFooter` estático institucional UTPL), clarificar textos de rol en `/registro`, `/login` y `/`, y añadir pruebas Jest + Playwright cubriendo los 4 estados de sesión y vista móvil 360 px.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 15 App Router  
**Primary Dependencies**: `@apuestas/shared`, `next/link`, React Context + Hooks (`lucide`-free inline SVG icons para mantener bundle mínimo)  
**Storage**: Sin almacenamiento persistente en navegador (`localStorage`/`sessionStorage` permanecen vacíos); sesión derivada en memoria desde cookies `httpOnly` vía `GET /auth/me`  
**Testing**: Jest + `@testing-library/react` (`apps/web/tests/`), Playwright (`apps/web/e2e/` en `mobile-360` y `desktop-chromium`)  
**Target Platform**: Vercel (`apps/web`) conectado vía `/api/proxy` a Render (`apps/api`) y navegadores móviles/escritorio desde 360 px  
**Project Type**: Frontend workspace en monorepo (`apps/web`)  
**Performance Goals**: Cero cascadas repetidas de `/auth/me` entre navegaciones cliente (única consulta inicial en `RootLayout`); cero librerías pesadas de íconos (`bundle-barrel-imports`)  
**Constraints**: Mantener compatibilidad íntegra con rutas, formularios y tests unitarios existentes de Specs 001–006; cero modificación en `apps/api`  
**Scale/Scope**: 1 contexto nuevo (`SessionProvider`), shell modular (`AppShell`, `SiteHeader`, `SiteSidebar`, `SiteFooter`, `NavIcons`), ajuste de envolvente en las 8 páginas existentes y estilos en `globals.css`

## Constitution Check

- [x] **I. Seguridad y antifraude**: La visibilidad del sidebar nunca sustituye RBAC en backend (`JwtAuthGuard`/`RolesGuard`); cero tokens en `localStorage`; rutas directas como `/operador` o `/admin/usuarios` siguen validadas por servidor.
- [x] **II. Integridad financiera**: N/A directo en `apps/api`; `/wallet` mantiene confirmación S2S intacta.
- [x] **III. Servidor como autoridad**: El rol mostrado en Topbar y Sidebar proviene siempre de `AuthUserView.role` emitido por `GET /auth/me` o `/auth/login`.
- [x] **IV. Pruebas primero**: Se escriben pruebas Jest para los 4 estados de rol + logout + footer + login/registro antes de implementar el shell y se amplía Playwright E2E.
- [x] **V. Tiempo real**: N/A (polling/fetch live en `Matchboard` se preserva intacto).
- [x] **VI. Simplicidad**: Reutiliza `apps/web` y `api-client.ts` existentes sin agregar servicios ni dependencias externas.
- [x] **VII. UX**: Mobile-first desde `360 px`, cajón accesible con `aria-expanded` + cierre por `Escape`, foco visible WCAG 2.1 AA y aplicación directa de `frontend-design`.

## Plan de Diseño (`frontend-design` Two-Pass)

### Pass 1: Tokens y Concepto
- **Paleta base (5 valores):**
  - `--bg-canvas: #f6f7f4` (fondo cálido neutro para lectura de cuotas y tablas)
  - `--bg-surface: #ffffff` (superficie de tarjetas y barra superior)
  - `--nav-bg: #0e1b22` (sidebar lateral + banda de cierre institucional oscuro, contraste >= 11:1 con `#e2e8f0`)
  - `--accent-pitch: #0f766e` (acentos, estado activo con indicador `#34d399` y botón primario)
  - `--ink-primary: #101923` y `--ink-muted: #475569`
- **Tipografía:** `Plus Jakarta Sans` en encabezados y navegación; `IBM Plex Mono` reservada únicamente a cuotas, saldos, reloj UTC y códigos técnicos (`font-variant-numeric: tabular-nums`).
- **Layout:** Shell de aplicación de dos columnas en escritorio (`256px` sidebar fijo oscuro + columna principal derecha con `Topbar`, `<main>` alineado a la izquierda y `Footer` estático al pie); en `< 960px` el sidebar pasa a drawer lateral accesible activado desde el botón de menú en la topbar.

### Pass 2: Crítica y Ajustes Respecto a Defaults
- Se elimina la fila horizontal de 8 píldoras genéricas y la jerga de prototipo en la parte superior del hero de `/` (`"modo de solo presentación"` / listados de roles se mueven limpiamente a una nota de plataforma o footer sin contaminar la vista de usuario final).
- Los badges de rol usan colores semánticos diferenciados (`Apostador` esmeralda, `Operador` azul pizarra, `Administrador` ámbar oscuro) y muestran tanto el nombre comprensible en español como el comportamiento en registro (`/registro` indica claramente *"Creando cuenta como: Apostador (`bettor`)"*).

## Project Structure

```text
specs/014-navegacion-roles-shell/
├── spec.md
├── plan.md
├── research.md
├── checklists/
│   └── requirements.md
└── tasks.md

apps/web/
├── src/
│   ├── context/
│   │   └── session-context.tsx      # SessionProvider (GET /auth/me + logout + actualización reactiva)
│   ├── components/
│   │   ├── nav-icons.tsx            # Íconos SVG inline ligeros por ruta/rol
│   │   ├── SiteHeader.tsx           # Topbar + compatibilidad AppShell (expone badge de rol y menú móvil)
│   │   ├── SiteSidebar.tsx          # Sidebar agrupado por rol real con cierre en móvil
│   │   ├── SiteFooter.tsx           # Footer estático UTPL (+18, sandbox, enlaces útiles)
│   │   └── AppShell.tsx             # Contenedor responsive sidebar + topbar + main + footer
│   └── app/
│       ├── layout.tsx               # Envuelve con <SessionProvider>
│       ├── globals.css              # Tokens y layout de sidebar/topbar/footer/badges + drawer 360px
│       ├── page.tsx                 # Cartelera limpia + info de plataforma compatible con tests
│       ├── login/page.tsx           # Actualiza SessionContext y muestra accesos según rol real
│       ├── registro/page.tsx        # Badge explícito de cuenta Apostador y explicación de 3 roles
│       ├── seguridad/page.tsx       # Usa AppShell y sincroniza 2FA/logout con SessionContext
│       ├── wallet/page.tsx          # Usa AppShell manteniendo flujo Payphone S2S
│       ├── verificar-correo/page.tsx# Usa AppShell
│       ├── operador/page.tsx        # Usa AppShell
│       └── admin/usuarios/page.tsx  # Usa AppShell
├── tests/
│   ├── app-shell.test.tsx           # Pruebas TDD de roles (visitante/bettor/operator/admin), logout, footer y drawer
│   ├── page.test.tsx                # Mantenido compatible
│   ├── wallet.test.tsx              # Mantenido compatible
│   ├── auth-pages.test.tsx          # Mantenido compatible
│   └── operator-and-confirm.test.tsx# Mantenido compatible
└── e2e/
    └── auth.spec.ts                 # Verifica landmarks banner/navigation/main/contentinfo + 360px sin overflow + toggle sidebar
```
