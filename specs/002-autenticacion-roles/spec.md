# Feature Specification: Identidad, Autenticación, RBAC y Auditoría

**Feature Branch**: `feature/spec-2`  
**Created**: 2026-11-15  
**Status**: Draft  
**Input**: Spec #2 (`002-autenticacion-roles`) — Fase F1 de `PLAN.md`: registro con verificación de correo y declaración de mayoría de edad, login con JWT en cookie `httpOnly` y refresh rotativo, hash de contraseñas con Argon2, 2FA TOTP, control de acceso basado en roles (RBAC) denegado por defecto, rate limiting / bloqueo por intentos fallidos / verificación CAPTCHA y módulo de auditoría append-only.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Registro con Mayoría de Edad y Verificación de Correo (Priority: P1)

Como usuario nuevo, necesito registrarme declarando explícitamente mi mayoría de edad (≥ 18 años) y verificar mi correo electrónico antes de poder iniciar sesión, para que la plataforma valide mi identidad y cumpla la restricción académica de edad.

**Why this priority**: Es la puerta de entrada segura al sistema; sin cuenta verificada y mayoría de edad validada en el servidor no debe existir acceso autenticado.

**Independent Test**: Se verifica enviando solicitudes de registro con datos válidos, inválidos (menor de edad, contraseña débil, CAPTCHA inválido) y confirmando el token de verificación por correo.

**Acceptance Scenarios**:

1. **Given** un visitante envía correo válido, contraseña fuerte, confirmación de mayoría de edad (`isAdultConfirmed: true`) y token CAPTCHA válido, **When** llama a `POST /auth/register`, **Then** el sistema crea la cuenta con rol `bettor`, guarda la contraseña con Argon2id, genera un token de verificación de un solo uso y registra `AUTH_REGISTER` en auditoría sin exponer el hash ni el token plano en BD.
2. **Given** un visitante envía `isAdultConfirmed: false` o intenta inyectar `"role": "admin"` en el cuerpo del registro, **When** llama a `POST /auth/register`, **Then** el servidor rechaza el registro de menor con HTTP `400` y siempre ignora o rechaza propiedades no permitidas (`forbidNonWhitelisted`), garantizando que ningún usuario se auto-asigne privilegios.
3. **Given** un usuario registrado con token de verificación válido y vigente, **When** llama a `POST /auth/verify-email`, **Then** la cuenta queda marcada como verificada, el token queda consumido (no reutilizable) y se registra `AUTH_EMAIL_VERIFIED` en auditoría.

---

### User Story 2 - Inicio de Sesión Seguro, Cookies `httpOnly` y Refresh Rotativo (Priority: P1)

Como usuario verificado, necesito iniciar sesión de forma segura mediante cookies `httpOnly` de corta duración y refresh tokens rotativos, y cerrar sesión limpiando mis credenciales, para proteger mi cuenta frente a robo de tokens (XSS/reuso).

**Why this priority**: Sustenta la autoridad del servidor en todas las specs futuras (billetera, apuestas, partidos y reportes).

**Independent Test**: Se verifica mediante flujo HTTP completo (Supertest): login → acceso a `GET /auth/me` con cookie → rotación en `POST /auth/refresh` → rechazo por reuso de token revocado → `POST /auth/logout`.

**Acceptance Scenarios**:

1. **Given** un usuario con correo verificado y sin 2FA activo, **When** envía credenciales válidas + CAPTCHA a `POST /auth/login`, **Then** el servidor responde HTTP `200`, establece cookies `httpOnly` (`access_token` de 15 min y `refresh_token` de 7 días), reinicia el contador de intentos fallidos y registra `AUTH_LOGIN_SUCCESS`.
2. **Given** un cliente con cookie `refresh_token` válida, **When** llama a `POST /auth/refresh`, **Then** el token anterior se revoca, se emite un nuevo par de tokens dentro de la misma familia de sesión y se registra `AUTH_REFRESH`.
3. **Given** un atacante intenta reutilizar un `refresh_token` ya rotado/consumido, **When** llama a `POST /auth/refresh`, **Then** el servidor rechaza con HTTP `401`, revoca toda la familia de tokens del usuario y registra `AUTH_REFRESH_REUSE_DETECTED` en auditoría.
4. **Given** un usuario falla el login 5 veces consecutivas, **When** realiza un sexto intento dentro de la ventana de bloqueo, **Then** el sistema bloquea temporalmente la cuenta, responde de forma genérica sin revelar si el correo existe o no, y registra `AUTH_LOCKED`.

---

### User Story 3 - Control de Acceso RBAC (Default-Deny), 2FA TOTP y Auditoría (Priority: P1)

Como operador o administrador, y como apostador que configurará retiros en fases futuras, necesito autorización RBAC estricta (denegada por defecto), configuración de 2FA TOTP y consulta de auditoría inmutable para garantizar privilegios mínimos y trazabilidad.

**Why this priority**: Cumple los principios constitucionales I (RBAC denegado por defecto y auditoría) y IV (pruebas obligatorias de abuso y autorización por rol).

**Independent Test**: Se verifica con matriz de roles por endpoint (`anónimo`, `bettor`, `operator`, `admin`), configuración/activación de TOTP de 6 dígitos y verificación de registros en `AuditLog`.

**Acceptance Scenarios**:

1. **Given** un endpoint protegido sin decorador `@Public()`, **When** se invoca sin cookie/token válido, **Then** responde HTTP `401`; si se invoca con rol `bettor` hacia una ruta `@Roles('admin')` (`GET /admin/users`, `PATCH /admin/users/:id/role`, `GET /admin/audit-logs`), **Then** responde HTTP `403`.
2. **Given** un usuario autenticado solicita activar 2FA, **When** llama a `POST /auth/2fa/setup` y confirma el código TOTP válido en `POST /auth/2fa/enable`, **Then** el secreto se almacena cifrado (AES-256-GCM), `totpEnabled` pasa a `true` y en los siguientes inicios de sesión se exige el código TOTP.
3. **Given** un administrador cambia el rol de un usuario mediante `PATCH /admin/users/:id/role`, **When** la operación concluye, **Then** queda registrada en la tabla append-only `AuditLog` con actor, objetivo, rol previo/nuevo, IP y User-Agent.

---

### User Story 4 - Interfaces Web de Identidad y Seguridad Accesibles (Priority: P2)

Como usuario o administrador, necesito pantallas limpias, responsivas desde 360 px y accesibles (`/registro`, `/login`, `/verificar-correo`, `/seguridad`, `/admin/usuarios`) que envíen credenciales por cookies `httpOnly` sin almacenar tokens en `localStorage` ni validar permisos solo en el cliente.

**Why this priority**: Permite probar e interactuar con autenticación, 2FA y RBAC de punta a punta desde el navegador respetando el Principio VII.

**Independent Test**: Pruebas de componentes con React Testing Library y flujo E2E Playwright verificando etiquetas accesibles, errores accionables, ausencia de tokens en `localStorage` y ausencia de desbordamiento horizontal en 360 px.

**Acceptance Scenarios**:

1. **Given** un usuario abre `/registro` o `/login` en móvil (360 px), **When** navega con teclado o envía datos inválidos, **Then** los campos tienen `label` asociado, foco visible y mensajes claros que explican qué falló y cómo resolverlo.
2. **Given** un usuario autenticado abre `/seguridad`, **When** solicita configurar 2FA TOTP, **Then** visualiza la clave/URI de configuración y puede confirmar su código de 6 dígitos mediante petición con `credentials: 'include'`.

---

### Edge Cases

- ¿Qué ocurre si un usuario intenta registrarse con un correo existente o con variaciones de mayúsculas/espacios (`User@Example.COM`)? El correo se normaliza (`trim().toLowerCase()`) y no se revela detalles internos de la BD; en login fallido el mensaje siempre es genérico para evitar enumeración.
- ¿Qué ocurre si un usuario no ha verificado su correo e intenta iniciar sesión? El servidor rechaza con `403` indicando que debe verificar su correo antes de continuar y registra el evento en auditoría.
- ¿Qué ocurre si un administrador intenta degradar su propio rol (`admin` → `bettor`) o dejar el sistema sin administradores? Se impide el auto-cambio de rol (`400`) para evitar bloqueo administrativo accidental.
- ¿Qué ocurre si el entorno local/CI no tiene un contenedor PostgreSQL activo durante `pnpm test`? La capa de repositorios soporta adaptador Prisma (PostgreSQL) en ejecución real y adaptador en memoria determinista en entorno de pruebas (`NODE_ENV=test` o sin `DATABASE_URL`).

## Vectores de Fraude, Abuso y Mitigaciones (Constitución I)

| Vector de fraude / abuso                         | Mitigación implementada                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ataque de fuerza bruta / relleno de credenciales | `@nestjs/throttler` por IP + bloqueo temporal de cuenta tras 5 fallos + verificación CAPTCHA + Argon2id                                                |
| Robo o reutilización de `refresh_token`          | Cookies `httpOnly`/`SameSite=Lax`/`Secure`, almacenamiento solo de hash SHA-256 y revocación completa de `familyId` ante reuso                         |
| Escalada de privilegios en registro o petición   | `ValidationPipe` (`forbidNonWhitelisted`), rol fijado a `bettor` en servidor y `APP_GUARD` global denegado por defecto (`JwtAuthGuard` + `RolesGuard`) |
| Robo de tokens desde XSS en navegador            | Tokens emitidos en cookies `httpOnly`; prohibido guardar JWT en `localStorage` o `sessionStorage`                                                      |
| Enumeración de cuentas registradas               | Respuestas de error genéricas en login y normalización uniforme de tiempos/mensajes                                                                    |
| Manipulación o borrado del rastro forense        | `AuditLog` append-only sin métodos/rutas de actualización ni eliminación                                                                               |
| Filtración de secretos TOTP si hay lectura de BD | Secreto TOTP cifrado con AES-256-GCM usando llave de entorno en backend (`TOTP_ENCRYPTION_KEY`)                                                        |

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: `POST /auth/register` DEBE validar correo, contraseña robusta (mínimo 10 caracteres, mayúscula, minúscula y dígito), declaración explícita de mayoría de edad (`isAdultConfirmed === true`) y verificación CAPTCHA antes de crear un usuario con rol `bettor`.
- **FR-002**: Las contraseñas DEBEN almacenarse únicamente con **Argon2id**; nunca en texto plano ni en respuestas API.
- **FR-003**: `POST /auth/verify-email` DEBE validar el hash del token de un solo uso, verificar su vigencia y marcar `emailVerifiedAt`.
- **FR-004**: `POST /auth/login` DEBE verificar CAPTCHA, comprobar bloqueo por intentos fallidos, validar correo verificado, comprobar contraseña Argon2id, exigir código TOTP válido si `totpEnabled === true`, y emitir `access_token` (JWT, 15 min) + `refresh_token` (opaco, 7 días) en cookies `httpOnly`.
- **FR-005**: `POST /auth/refresh` DEBE rotar el refresh token y revocar toda la familia (`familyId`) si detecta reutilización de un token ya consumido o revocado.
- **FR-006**: `POST /auth/logout` DEBE revocar el refresh token actual y limpiar ambas cookies.
- **FR-007**: `JwtAuthGuard` y `RolesGuard` DEBEN registrarse globalmente con política denegada por defecto; solo las rutas marcadas con `@Public()` omiten autenticación.
- **FR-008**: `POST /auth/2fa/setup` y `POST /auth/2fa/enable` DEBEN generar un secreto TOTP cifrado en reposo y activarlo solo tras verificar un código TOTP de 6 dígitos válido.
- **FR-009**: `GET /admin/users`, `PATCH /admin/users/:id/role` y `GET /admin/audit-logs` DEBEN restringirse exclusivamente al rol `admin`.
- **FR-010**: `AuditModule` DEBE exponer `AuditService.record(...)` para persistir eventos inmutables (`who`, `action`, `when`, `ip`, `userAgent`, `deviceFingerprint`, `metadata`) desde esta spec y todas las futuras.
- **FR-011**: `apps/web` DEBE proveer rutas `/registro`, `/login`, `/verificar-correo`, `/seguridad` y `/admin/usuarios` responsivas desde 360 px, WCAG 2.1 AA, usando `frontend-design` y `credentials: 'include'`.

### Key Entities _(include if feature involves data)_

- **User**: Cuenta del usuario con credenciales Argon2id, rol RBAC (`bettor | operator | admin`), estado de verificación de correo, confirmación de mayoría de edad, estado/secreto cifrado de 2FA TOTP y contadores de bloqueo.
- **EmailVerificationToken**: Token temporal de un solo uso almacenado como hash SHA-256.
- **RefreshToken**: Sesión rotativa agrupada por `familyId`, almacenada como hash SHA-256 con trazabilidad de reemplazo y revocación.
- **AuditLog**: Registro append-only de acciones sensibles y eventos de seguridad.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% de las rutas protegidas rechazan peticiones sin sesión (`401`) o con rol insuficiente (`403`) en pruebas automatizadas.
- **SC-002**: 5 intentos fallidos de login bloquean automáticamente la cuenta y rechazan intentos posteriores durante la ventana configurada; el rate limiter bloquea ráfagas excesivas (`429`).
- **SC-003**: El reuso de un refresh token rotado revoca la familia completa de tokens y devuelve `401` en pruebas Supertest.
- **SC-004**: Toda acción sensible (registro, verificación, login exitoso/fallido, bloqueo, refresh/reuso, 2FA, cambio de rol) produce un registro verificable en `AuditLog`.
- **SC-005**: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` y `prisma validate` pasan en verde.

## Assumptions

- Para entorno académico/CI sin proveedor SMTP externo, el envío de token de verificación de correo se abstrae mediante `EmailVerificationNotifier` (registro controlado en logs en desarrollo y captura determinista en pruebas; en producción conectable a SMTP/Resend).
- `CaptchaService` valida tokens contra Cloudflare Turnstile cuando `CAPTCHA_PROVIDER=turnstile` con `CAPTCHA_SECRET_KEY`, y ofrece modo determinista controlado para desarrollo/pruebas locales (`CAPTCHA_PROVIDER=mock`, rechazando tokens vacíos o marcados como inválidos).
- El esquema Prisma soporta PostgreSQL como motor oficial (`docker-compose.yml` y Render), y las interfaces de repositorio permiten ejecutar toda la suite `pnpm test` localmente sin requerir Docker instalado.
