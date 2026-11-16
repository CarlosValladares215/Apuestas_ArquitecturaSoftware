# Tasks: Shell de Navegación por Roles, Sidebar con Íconos y Footer

**Input**: Design documents from `/specs/014-navegacion-roles-shell/`  
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `checklists/requirements.md`

## Phase 1: Foundational Session State & Tests First (TDD Red)

- [x] T001 [US1][US2][US3][US4] Write failing unit tests in `apps/web/tests/app-shell.test.tsx` covering: 4 session visibility states (`visitor`, `bettor`, `operator`, `admin`), SVG sidebar links per role, visible topbar role badge & logout flow (`POST /auth/logout`), static `SiteFooter` (`contentinfo`) presence, mobile drawer toggle (`aria-expanded`) and explicit `Apostador (bettor)` registration role clarity
- [x] T002 Create `SessionProvider` and `useSession()` hook in `apps/web/src/context/session-context.tsx` querying `GET /auth/me` with `credentials: 'include'` and exposing reactive `setSessionUser` and `logout`

---

## Phase 2: Modular AppShell, Sidebar Icons, Topbar & Static Footer (US1, US2, US3)

- [x] T003 [P] [US1] Create inline SVG icon set in `apps/web/src/components/nav-icons.tsx`
- [x] T004 [US1][US4] Implement role-filtered `SiteSidebar` (`apps/web/src/components/SiteSidebar.tsx`) with mobile drawer close handling (`Escape` and route selection) and system role guide card
- [x] T005 [US2] Implement `SiteFooter` (`apps/web/src/components/SiteFooter.tsx`) with institutional UTPL sandbox branding, `+18` responsible notice, active architecture summary, and quick links
- [x] T006 [US1][US2][US4] Update `SiteHeader` (`apps/web/src/components/SiteHeader.tsx`) to expose clean Topbar with mobile drawer toggle, active user email, distinct role badge (`Apostador`/`Operador`/`Administrador`), and `Cerrar sesión` / guest CTAs, plus unified `AppShell` (`apps/web/src/components/AppShell.tsx`)
- [x] T007 [US1][US2][US3] Add editorial slate/pitch shell styles (`sidebar`, `drawer` <= 960px, `role-badge-*`, `site-footer`, responsive grid) in `apps/web/src/app/globals.css` avoiding horizontal overflow at 360 px

---

## Phase 3: Wire RootLayout & Pages Without Breaking Existing Tests

- [x] T008 Wrap `RootLayout` (`apps/web/src/app/layout.tsx`) in `SessionProvider`
- [x] T009 [US1][US2][US3] Update routes (`page.tsx`, `login/page.tsx`, `registro/page.tsx`, `seguridad/page.tsx`, `wallet/page.tsx`, `verificar-correo/page.tsx`, `operador/page.tsx`, `admin/usuarios/page.tsx`) to use `AppShell`, synchronize `SessionProvider` on login/2FA/logout, remove dev-wireframe clutter from `/` hero, and clarify account roles in `/registro` and `/login`
- [x] T010 Verify Jest tests (`apps/web/tests/`) including all pre-existing suites (`page.test.tsx`, `wallet.test.tsx`, `auth-pages.test.tsx`, `operator-and-confirm.test.tsx`) and new `app-shell.test.tsx` pass completely

---

## Phase 4: Playwright Mobile-360 / Desktop E2E & Monorepo Validation

- [x] T011 Update Playwright E2E suite in `apps/web/e2e/auth.spec.ts` to assert `banner`, `navigation`, `main`, `contentinfo` landmarks, mobile drawer open/close at 360 px without horizontal overflow, and run full verification (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, live Playwright + `specs/README.md` update)
