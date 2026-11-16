# Feature Specification: Shell de Navegación por Roles, Sidebar con Íconos y Footer

**Feature Branch**: `feature/014-navegacion-roles-shell`  
**Created**: 2026-11-16  
**Status**: Draft  
**Input**: Refactorización integral de arquitectura de navegación en `apps/web`: reemplazar el header plano con 8 píldoras mezcladas por un `AppShell` responsivo (sidebar lateral con íconos SVG, topbar con estado visible de sesión/rol y botón de cierre de sesión, visibilidad filtrada por rol real devuelto por `GET /auth/me`, copy orientado a usuario final en `/` y `/registro`, y footer estático institucional UTPL).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Navegación Ordenada por Roles mediante Sidebar con Íconos (Priority: P1)

Como usuario de la plataforma (visitante, apostador, operador o administrador), necesito un menú lateral estructurado por secciones e íconos claros que muestre únicamente las vistas acordes a mi rol real en el servidor, para no confundir las opciones de cliente con las herramientas internas de operación o administración.

**Why this priority**: Es la causa raíz de la desorganización actual del header plano (`Cartelera`, `Billetera`, `Operador`, `Registro`, `Ingresar`, `Verificar correo`, `Seguridad 2FA`, `Admin` juntos sin jerarquía).

**Independent Test**: Montar `SessionProvider` + `AppShell` con respuestas mockeadas/reales de `GET /auth/me` para 4 estados (`anónimo`, `bettor`, `operator`, `admin`) y verificar qué secciones y enlaces renderiza el sidebar en cada estado.

**Acceptance Scenarios**:

1. **Given** un visitante sin sesión activa (`GET /auth/me` → `401`), **When** abre cualquier vista en `apps/web`, **Then** el sidebar muestra únicamente navegación pública (`Cartelera`) y acciones de acceso (`Ingresar`, `Crear cuenta`, `Verificar correo`), ocultando `Panel de Operador` y `Administración` y mostrando una guía breve de los 3 roles del sistema (`Apostador`, `Operador`, `Administrador`).
2. **Given** un usuario autenticado con rol `bettor`, **When** carga la aplicación, **Then** el sidebar muestra la sección _Tu cuenta_ (`Cartelera`, `Billetera`, `Seguridad 2FA`) y no muestra enlaces de `Operador` ni `Admin`.
3. **Given** un usuario autenticado con rol `operator`, **When** carga la aplicación, **Then** el sidebar muestra la sección _Tu cuenta_ más la sección _Operación deportiva_ (`Panel de Operador`), sin mostrar `Administración`.
4. **Given** un usuario autenticado con rol `admin`, **When** carga la aplicación, **Then** el sidebar muestra _Tu cuenta_, _Operación deportiva_ (`Panel de Operador`) y _Administración_ (`Usuarios y Auditoría`).

---

### User Story 2 - Visibilidad Clara de Identidad, Rol Activo y Cierre de Sesión (Priority: P1)

Como usuario registrado o administrador, necesito ver claramente en todo momento si estoy autenticado, con qué correo y qué rol tengo (`Apostador`, `Operador`, `Administrador`), y aclarar durante el registro e inicio de sesión qué tipo de cuenta estoy usando, para entender el funcionamiento del sistema sin adivinar permisos.

**Why this priority**: Evita la ambigüedad reportada al registrarse/iniciar sesión y permite cambiar de rol (cerrar sesión) desde cualquier pantalla sin tener que navegar hasta `/seguridad`.

**Independent Test**: Iniciar sesión en `/login` (observando actualización inmediata de `Topbar`/`Sidebar` vía `SessionContext` sin recargar), verificar badge visible de rol en topbar y pulsar `Cerrar sesión` (`POST /auth/logout`).

**Acceptance Scenarios**:

1. **Given** un usuario autenticado (`bettor`, `operator` o `admin`), **When** navega por cualquier ruta, **Then** la barra superior muestra su correo, un badge visual diferenciado del rol (`Apostador`, `Operador` o `Administrador`) y el botón `Cerrar sesión`.
2. **Given** un usuario abre `/registro`, **When** observa el formulario, **Then** ve un indicador explícito de que las cuentas públicas nuevas se crean exclusivamente con el rol **Apostador (`bettor`)**, mientras que **Operador** y **Administrador** son roles internos asignados desde Administración.
3. **Given** un usuario autenticado pulsa `Cerrar sesión` en el header o sidebar, **When** `POST /auth/logout` concluye, **Then** la sesión limpia sus cookies en servidor y la navegación regresa de inmediato a modo visitante.

---

### User Story 3 - Limpieza de Copy Técnico en Portada y Footer Institucional Estático (Priority: P2)

Como evaluador o usuario final de la plataforma, necesito que la página principal `/` presente la cartelera con lenguaje claro de producto deportivo (sin jerga interna de maqueta) y que todas las pantallas cierren con un footer institucional estático de la plataforma (+18, sandbox académico UTPL y resumen de controles activos).

**Why this priority**: Elimina la apariencia de wireframe/maqueta Figma y cierra la estructura visual completa de todas las rutas (`AppShell`).

**Independent Test**: Renderizar `/` y rutas internas verificando presencia de landmark `<footer>` (`contentinfo`), textos de usuario final sin mensajes técnicos crudos en el hero, y cumplimiento continuo de las aserciones de seguridad (`solo presentación`, enlace a `/wallet`, sin claves expuestas).

**Acceptance Scenarios**:

1. **Given** cualquier página dentro de `AppShell`, **When** se renderiza en escritorio o móvil, **Then** existe un landmark `<footer>` (`role="contentinfo"`) estático con marca UTPL, aviso `+18 · Sandbox académico sin dinero real`, estado de seguridad y enlaces rápidos de navegación.
2. **Given** un usuario visita `/`, **When** lee la cabecera principal, **Then** observa un título y subtítulo orientados al apostador/observador sin listados crudos de roles internos ni jerga de prototipo en el hero.

---

### User Story 4 - Responsividad Móvil (360 px) y Compatibilidad Total sin Regresiones (Priority: P1)

Como evaluador usando móvil (360 px) o escritorio, necesito que el sidebar se convierta en un cajón desplegable accesible en pantallas estrechas sin generar desplazamiento horizontal, y que ninguna ruta existente ni regla de seguridad RBAC en backend se rompa.

**Why this priority**: Cumple el Principio VII de la Constitución y garantiza cero roturas sobre Specs 001–006.

**Independent Test**: Suite Jest de componentes (`apps/web/tests/`) y suite Playwright en `360x740` (`mobile-360`) y `desktop-chromium` comprobando `scrollWidth <= clientWidth`, apertura/cierre de menú móvil y contraste/accesibilidad de landmarks.

**Acceptance Scenarios**:

1. **Given** cualquier ruta (`/`, `/registro`, `/login`, `/verificar-correo`, `/seguridad`, `/wallet`, `/operador`, `/admin/usuarios`) abierta en `360x740`, **When** se evalúa el layout antes y después de abrir el cajón de navegación, **Then** `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, el botón menú actualiza `aria-expanded` y el teclado/foco permanece accesible.
2. **Given** un usuario con rol `bettor` intenta navegar directamente por URL a `/operador` o `/admin/usuarios`, **When** la vista solicita datos al backend, **Then** `apps/api` sigue denegando la petición con HTTP `403` y la interfaz muestra la alerta clara de acceso restringido.

---

### Edge Cases

- ¿Qué ocurre si `GET /auth/me` falla por red o backend en reposo (cold start de Render)? El cliente no bloquea el renderizado inicial (`children` y cartelera SSR siguen visibles); muestra modo visitante sin romper la navegación y permite reintentar al interactuar.
- ¿Qué ocurre en pruebas unitarias aisladas que renderizan una página individual (`render(<WalletPage />)`, `render(<SecurityPage />)`, etc.) sin montar `RootLayout`? `useSession()` detecta `isManagedByProvider: false` y no dispara peticiones extra a `/auth/me` que interfieran con los mocks dedicados de cada página.
- ¿Qué ocurre si el usuario pulsa `Escape` o navega a otra ruta en móvil (`360 px`) con el drawer abierto? El drawer se cierra automáticamente.

## Vectores de Fraude, Abuso y Mitigaciones (Constitución I y III)

| Vector / Riesgo                                                               | Mitigación                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confusión entre ocultar UI por rol y seguridad real ("security by obscurity") | El filtrado en sidebar es exclusivamente UX; toda ruta protegida sigue exigiendo cookie `httpOnly` + `JwtAuthGuard` + `RolesGuard` (`@Roles(...)`) en `apps/api`.   |
| Autoinyección de rol durante registro creyendo elegir perfil                  | `/registro` explica explícitamente que toda cuenta pública nace como `bettor`; `auth.service.ts` fija `role: 'bettor'` en servidor con `forbidNonWhitelisted`.      |
| Almacenamiento inseguro de sesión/rol en `localStorage`                       | El rol activo se obtiene exclusivamente en memoria React desde `GET /auth/me` con `credentials: 'include'`, jamás persistido en `localStorage` ni `sessionStorage`. |

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: `apps/web` DEBE proveer un `SessionProvider` en `RootLayout` (`apps/web/src/app/layout.tsx`) que consulte `GET /auth/me` con `credentials: 'include'` y mantenga el estado reactivo del usuario (`AuthUserView | null`), actualizable al instante tras login, 2FA, refresh y logout.
- **FR-002**: Todas las páginas de `apps/web` DEBEN usar un `AppShell` unificado compuesto por Topbar superior (`role="banner"`), Sidebar lateral agrupado con íconos SVG (`role="navigation"`), contenedor principal (`role="main"`) y Footer institucional estático (`role="contentinfo"`).
- **FR-003**: El Sidebar DEBE agrupar enlaces por contexto/rol: Visitante (`Cartelera`, `Ingresar`, `Crear cuenta`, `Verificar correo`), Apostador (`Cartelera`, `Billetera`, `Seguridad 2FA`), Operador (+ `Operador`) y Administrador (+ `Operador`, `Admin / Auditoría`).
- **FR-004**: La Topbar DEBE mostrar en todo momento el correo conectado y badge legible del rol (`Apostador`, `Operador`, `Administrador`) + acción `Cerrar sesión` cuando hay sesión activa, o estado `Visitante` + accesos `Ingresar` / `Crear cuenta` cuando no la hay.
- **FR-005**: `/registro` y `/login` DEBEN comunicar explícitamente los roles del sistema y confirmar en el login exitoso el rol obtenido desde el servidor con accesos contextuales.
- **FR-006**: En pantallas menores a `960 px` (incluyendo `360 px`), el sidebar DEBE colapsarse en un cajón accesible (`aria-expanded`, `aria-controls`, cierre con `Escape` y botón cerrar) sin desbordamiento horizontal.
- **FR-007**: El diseño DEBE preservar la compatibilidad completa con todas las pruebas funcionales existentes de Specs 001–006 y no modificar contratos backend en `apps/api`.

### Success Criteria _(mandatory)_

- **SC-001**: 100% de las 8 rutas de `apps/web` rinden con `banner`, `navigation`, `main` y `contentinfo` y cero overflow horizontal en `360x740` (Playwright `mobile-360` + `desktop-chromium`).
- **SC-002**: Cobertura automatizada en Jest verificando visibilidad exacta de enlaces y badges para los 4 estados de sesión (`visitante`, `bettor`, `operator`, `admin`), toggle móvil del sidebar, logout global y footer estático.
- **SC-003**: `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` verdes en todo el monorepo tras el cambio final, sin tocar `apps/api` ni romper sus 16 suites / 47 tests.
