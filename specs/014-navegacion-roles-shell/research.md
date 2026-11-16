# Research & Design Decisions: Shell de Navegación por Roles (014)

## Decisión 1 — Ubicación de `SessionProvider` sin romper tests unitarios aislados de página

- **Contexto:** Los tests existentes en `apps/web/tests/wallet.test.tsx` y `apps/web/tests/auth-pages.test.tsx` renderizan componentes de página directamente (`render(<WalletPage />)`, `render(<SecurityPage />)`, `render(<AdminUsersPage />)`) con un `global.fetch` mockeado secuencialmente (`mockResolvedValueOnce`) o que falla si llega una URL imprevista (`/auth/me`).
- **Decisión:** Colocar `<SessionProvider>` en `apps/web/src/app/layout.tsx` (`RootLayout`) y exponer en `SessionContext` la bandera `isManagedByProvider`.
  - Cuando `RootLayout` monta la aplicación real (y en pruebas de `app-shell.test.tsx` o Playwright), `SessionProvider` consulta `GET /auth/me` **una sola vez** al iniciar, cachea `user` entre navegaciones cliente (evitando waterfalls repetidos según `vercel-react-best-practices`), y permite que `loginAccount`, `enableTotp` y `logoutAccount` actualicen el estado global al instante.
  - Cuando un test unitario aislado renderiza una página individual sin `RootLayout`, `isManagedByProvider` es `false`, por lo que `AppShell` usa modo visitante seguro sin disparar un `fetch('/auth/me')` inesperado dentro de `SiteHeader`/`AppShell`.
- **Alternativa descartada:** Hacer `fetch('/auth/me')` dentro de `useEffect` de `SiteHeader.tsx`. Provocaría una petición duplicada en cada cambio de ruta y rompería los mocks unitarios existentes.

## Decisión 2 — Íconos SVG inline vs. librerías externas

- **Decisión:** Implementar `apps/web/src/components/nav-icons.tsx` con componentes SVG mínimos (`width="18" height="18"`, `aria-hidden="true"`).
- **Razón:** Aplica la regla `bundle-barrel-imports` de `vercel-react-best-practices`, evita instalar paquetes nuevos antes de una entrega y asegura trazos consistentes en el sidebar oscuro.

## Decisión 3 — Política de visibilidad por rol en Sidebar vs. Acceso por URL

- **Matriz visual en `SiteSidebar.tsx`:**
  - `visitor` (`user === null`): `Cartelera` (`/`), `Ingresar` (`/login`), `Crear cuenta` (`/registro`), `Verificar correo` (`/verificar-correo`).
  - `bettor`: `Cartelera` (`/`), `Mi Billetera` (`/wallet`), `Seguridad 2FA` (`/seguridad`).
  - `operator`: ítems de `bettor` + grupo _Operación deportiva_ (`Panel de Operador` `/operador`).
  - `admin`: ítems de `operator` + grupo _Administración_ (`Usuarios y Auditoría` `/admin/usuarios`).
- **Nota de seguridad:** El ocultamiento visual mejora la experiencia de usuario y evita confusión entre clientes y administradores; el control de autorización real permanece garantizado exclusivamente en el backend (`JwtAuthGuard` + `RolesGuard`).
