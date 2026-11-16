# Feature Specification: Ledger Contable Inmutable, Billetera y Depósitos Payphone

**Feature Branch**: `feature/spec-3`  
**Created**: 2026-11-15  
**Status**: Ready for Implementation  
**Input**: Specs #3 y #4 (`003-billetera-ledger` + `004-depositos-payphone`) — Fase F2 de `PLAN.md`: Libro contable de doble entrada inmutable (cuentas separadas: usuario-real, usuario-bono, casa, pasarela), cálculo de saldo exclusivamente derivado del ledger, bloqueo de fila (`SELECT ... FOR UPDATE`) para control de concurrencia y prevención de doble gasto, claves de idempotencia obligatorias en toda operación monetaria, e integración de depósitos con pasarela Payphone en modo sandbox mediante protocolo estricto servidor a servidor (el redirect del navegador nunca acredita saldo).

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Depósito de Fondos vía Payphone Sandbox con Confirmación Servidor a Servidor (Priority: P1) 🎯 MVP

Como apostador autenticado, necesito iniciar una recarga de saldo mediante Payphone en modo sandbox y ver mis fondos reales reflejados en mi billetera únicamente tras la confirmación verificada servidor a servidor entre el backend y Payphone, para contar con saldo disponible para apostar de forma segura y sin riesgos de acreditación ilegítima.

**Why this priority**: Es el flujo de entrada de capital a la plataforma. Sin depósitos acreditados conforme a las reglas financieras innegociables (Principios I y II de la Constitución), no puede existir actividad de apuestas ni liquidación posterior.

**Independent Test**: Se verifica iniciando una intención de pago desde la API/web, simulando la confirmación de Payphone directamente hacia el backend con coincidencia de monto, moneda y referencia, y comprobando que el ledger registra el asiento de partida doble y el saldo del usuario se incrementa exactamente en el monto depositado.

**Acceptance Scenarios**:

1. **Given** un usuario con sesión activa en `apps/web` o API, **When** solicita iniciar un depósito por \$25.00 USD con una clave de idempotencia única, **Then** el servidor genera una intención de pago en estado `PENDING`, registra un identificador único de transacción (`clientTransactionId`) y devuelve el enlace o token de pago de Payphone Sandbox sin alterar el saldo de la billetera.
2. **Given** una intención de pago `PENDING` por \$25.00 USD, **When** el webhook o endpoint de confirmación del backend recibe el payload de Payphone y valida servidor a servidor que `status == 'Approved'`, `amount == 2500` centavos, `currency == 'USD'` y `clientTransactionId` coincide, **Then** el backend ejecuta una transacción atómica que acredita la cuenta `user_real` y debita la cuenta `gateway:payphone`, actualiza el estado a `COMPLETED` y deja disponible el nuevo saldo.
3. **Given** el navegador del usuario es redirigido de regreso desde Payphone hacia la URL de retorno del frontend, **When** la página carga en el navegador, **Then** la interfaz no acredita saldo por sí misma, sino que consulta el estado verificado en el backend mediante `GET /api/v1/wallet/balance`.

---

### User Story 2 - Consulta de Saldo Derivado y Movimientos de Billetera (Priority: P1)

Como apostador, necesito consultar el saldo disponible de mi billetera (desglosado en saldo real y saldo de bonificación) y el historial inmutable de movimientos contables para tener total transparencia sobre mis transacciones financieras.

**Why this priority**: Cumple la exigencia constitucional de que el saldo sea derivado del ledger y nunca un valor numérico mutable almacenado independientemente, garantizando que el usuario y la plataforma siempre tengan consistencia matemática auditada.

**Independent Test**: Se verifica consultando `GET /api/v1/wallet/balance` y `GET /api/v1/wallet/movements` tras sucesivos asientos contables, comprobando que la suma matemática de los asientos (`créditos - débitos`) coincide al céntimo con el saldo retornado y que la UI presenta la información sin realizar cálculos en el cliente.

**Acceptance Scenarios**:

1. **Given** un usuario con 3 depósitos aprobados de \$10.00, \$15.00 y \$20.00 USD y un débito por apuesta de \$5.00 USD, **When** consulta su balance, **Then** el servicio suma los asientos del ledger y retorna `realBalance: 40.00`, `bonusBalance: 0.00` y `currency: 'USD'`.
2. **Given** un usuario con movimientos en cuentas de bono y cuentas reales, **When** consulta el historial de movimientos, **Then** recibe una lista paginada en orden cronológico descendente con fecha ISO, tipo de movimiento, cuenta afectada, referencia de transacción, monto y descripción.

---

### User Story 3 - Integridad Financiera y Bloqueo Concurrente Anti-Doble Gasto (Priority: P1)

Como sistema de apuestas deportivas, requiero que múltiples solicitudes simultáneas de débito o depósito sobre la misma billetera se serialicen mediante transacciones ACID con bloqueo de fila (`SELECT ... FOR UPDATE`), para impedir condiciones de carrera, saldos negativos o doble gasto de dinero.

**Why this priority**: En plataformas de apuestas concurrentes, los ataques de concurrencia y las peticiones simultáneas son el vector número uno de fraude financiero. El Principio II exige tolerancia cero a inconsistencias de saldo.

**Independent Test**: Se ejecutan N operaciones concurrentes (por ejemplo, 10 débitos simultáneos de \$10.00 sobre una billetera con \$50.00 iniciales) mediante `Promise.all`: exactamente 5 débitos deben aceptarse y 5 deben rechazarse por saldo insuficiente, dejando el saldo final exactamente en \$0.00.

**Acceptance Scenarios**:

1. **Given** una billetera con un saldo real inicial de \$50.00 USD, **When** se ejecutan 10 peticiones concurrentes de débito por \$10.00 cada una sobre la misma cuenta, **Then** exactamente 5 transacciones resultan exitosas (HTTP 200/201), exactamente 5 fallan con error de saldo insuficiente (HTTP 409 o 422), y el saldo final derivado del ledger es exactamente \$0.00 USD.
2. **Given** una billetera con saldo \$0.00 USD, **When** se intenta debitar \$1.00 USD para una apuesta, **Then** la transacción es rechazada de inmediato sin generar ningún asiento contable.

---

### User Story 4 - Idempotencia Estricta, Rechazo de Manipulación y Asientos Compensatorios (Priority: P2)

Como oficial de seguridad y auditor financiero, necesito que toda confirmación duplicada de pasarela o reintento de red sea idempotente, que cualquier alteración en monto o moneda sea rechazada y registrada en auditoría, y que las correcciones financieras se realicen exclusivamente mediante asientos compensatorios inmutables.

**Why this priority**: La resiliencia frente a duplicados de red y ataques de alteración de parámetros (tampering) garantiza la robustez del sistema frente a fallos de infraestructura y actores maliciosos.

**Independent Test**: Se envía dos veces la misma confirmación de Payphone para la misma transacción: la segunda petición debe retornar confirmación idempotente sin generar un nuevo asiento ni duplicar el saldo acreditado. Se envía una confirmación con monto alterado: el backend debe rechazarla y marcar la intención como sospechosa.

**Acceptance Scenarios**:

1. **Given** una intención de pago ya confirmada y acreditada en el ledger, **When** el webhook de Payphone o el cliente reenvía la confirmación con el mismo `payphoneTxId` y clave de idempotencia, **Then** el backend responde exitosamente confirmando la transacción sin crear nuevos asientos en el ledger ni incrementar el saldo.
2. **Given** una intención de pago registrada por \$10.00 USD (1000 centavos), **When** un atacante intenta enviar una confirmación afirmando un monto de \$100.00 USD o una moneda distinta a USD, **Then** el backend rechaza la operación, marca la intención como `REJECTED`/`TAMPERED`, no realiza asientos y registra un evento de auditoría de seguridad.
3. **Given** una transacción contable que requiera ser ajustada o revertida administrativamente, **When** se ejecuta la corrección, **Then** el sistema crea una nueva transacción de tipo `COMPENSATION` con los débitos y créditos inversos, preservando intactos los registros históricos originales.

---

### Edge Cases

- **Monto con decimales extendidos**: La API y el ledger manejan importes monetarios en centavos enteros (`cents: bigint` o `integer`) para evitar errores de redondeo de punto flotante de IEEE 754.
- **Moneda no soportada**: Se rechaza cualquier transacción que no sea explícitamente `USD` (moneda de curso en Ecuador y compatible con Payphone Sandbox).
- **Desconexión durante la llamada a Payphone**: Si el servicio de Payphone Sandbox no responde durante la verificación servidor a servidor, la intención permanece en estado `PENDING` para reintento seguro, sin acreditar saldo preventivo.
- **Agotamiento de cuota o reintentos de webhook**: La clave de idempotencia permite reintentos ilimitados del webhook de la pasarela sin riesgo de doble procesamiento.
- **Auditoría inmutable**: Cualquier intento de manipulación o fallo de validación queda asentado en la bitácora de auditoría con dirección IP, marca de tiempo y referencia del usuario.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE implementar un libro contable (ledger) inmutable de partida doble en el que cada transacción esté compuesta por al menos un débito y un crédito que balanceen exactamente a cero (`sum(debits) == sum(credits)`).
- **FR-002**: Las cuentas contables DEBEN estar clasificadas por tipo:
  - `user_real`: Cuenta de fondos reales del usuario (`user_real:{userId}`).
  - `user_bonus`: Cuenta de saldo de bonificación del usuario (`user_bonus:{userId}`).
  - `house`: Cuenta institucional de la plataforma (`house:main`, `house:payouts`, `house:bonuses`).
  - `gateway`: Cuenta de compensación de la pasarela de pagos (`gateway:payphone`).
- **FR-003**: El saldo disponible de un usuario DEBE calcularse dinámicamente derivándolo de la suma de los asientos contables registrados (`credits - debits` para cuentas de usuario). Queda terminantemente PROHIBIDO almacenar un saldo numérico mutable que se actualice directamente mediante `UPDATE balance = ...` sin respaldo de asientos del ledger.
- **FR-004**: Los registros de transacciones y asientos contables DEBEN ser append-only e inmutables. Ninguna operación de base de datos puede realizar `UPDATE` o `DELETE` sobre las tablas `ledger_transactions` ni `ledger_entries`. Las correcciones se realizan exclusivamente mediante transacciones compensatorias (`COMPENSATION`).
- **FR-005**: Toda operación de débito o crédito en la billetera DEBE ejecutarse dentro de una transacción de base de datos con nivel de aislamiento serializable o bloqueo pesimista de fila (`SELECT ... FOR UPDATE`) sobre el registro de control de la billetera del usuario.
- **FR-006**: Toda mutación financiera en la API DEBE exigir una clave de idempotencia (`idempotencyKey` en cabecera `Idempotency-Key` o en cuerpo DTO). Si una solicitud se repite con la misma clave, el sistema debe devolver el resultado original sin duplicar asientos contables.
- **FR-007**: El flujo de depósitos con Payphone Sandbox DEBE estructurarse en dos etapas obligatorias:
  1. _Creación de Intención_: Generación de `PaymentIntent` en estado `PENDING` con `clientTransactionId` único, `amount` y `currency: 'USD'`.
  2. _Confirmación Servidor a Servidor_: Validación contra el endpoint `/api/button/V2/Confirm` de Payphone verificando token de autorización, estado aprobado, coincidencia exacta de monto, moneda y `clientTransactionId`.
- **FR-008**: El regreso o redirección del navegador desde la pasarela hacia `apps/web` NUNCA DEBE acreditar saldo por sí mismo. Solo el backend tras la confirmación exitosa con la API de Payphone puede generar el asiento contable.
- **FR-009**: Si la confirmación de Payphone contiene un monto, moneda o referencia que no coincida exactamente con la intención de pago registrada, el sistema DEBE rechazar la acreditación, marcar la intención como `REJECTED`, registrar una alerta en la bitácora de auditoría y no tocar el ledger.
- **FR-010**: El servicio de billetera DEBE exponer endpoints seguros en `apps/api`:
  - `GET /api/v1/wallet/balance`: Obtiene el saldo real y de bono del usuario autenticado.
  - `GET /api/v1/wallet/movements`: Lista los asientos y transacciones contables del usuario con filtros y paginación.
  - `POST /api/v1/wallet/deposits/intent`: Registra una nueva intención de recarga y genera el identificador de pasarela.
  - `POST /api/v1/wallet/deposits/confirm`: Recibe y valida servidor a servidor la confirmación de pago de Payphone.
  - `POST /api/v1/wallet/debit`: Endpoint interno transaccional con bloqueo de concurrencia para descontar saldo en operaciones autorizadas (apuestas).
- **FR-011**: En caso de saldo insuficiente para un débito, la operación DEBE ser rechazada de forma atómica sin modificar ninguna cuenta y arrojando una excepción HTTP estándar con código de negocio descriptivo (`INSUFFICIENT_FUNDS`).
- **FR-012**: Las credenciales de Payphone (`PAYPHONE_TOKEN`, `PAYPHONE_CLIENT_ID`, `PAYPHONE_APP_ID`) DEBEN residir exclusivamente en las variables de entorno del backend (`apps/api/.env`), nunca en `apps/web` ni en el repositorio.
- **FR-013**: `apps/web` DEBE ofrecer una interfaz de usuario limpia, intuitiva y accesible (WCAG 2.1 AA) para consultar saldo, visualizar historial de movimientos y crear intenciones de depósito, funcionando perfectamente desde 360 px de ancho (mobile-first).
- **FR-014**: La interfaz de usuario en `apps/web` NUNCA DEBE calcular saldos ni alterar importes en el cliente; debe consumir exclusivamente los datos consolidados retornados por `apps/api`.
- **FR-015**: Toda acción de depósito, débito, intento fallido o rechazo por alteración de datos DEBE persistirse en la tabla append-only de `audit_logs` con `userId`, `action`, `resource`, `ipAddress` y `metadata`.

---

### Key Entities

- **LedgerAccount**: Representa una cuenta contable en el plan de cuentas. Atributos: `id`, `code` (ej. `user_real:usr_123`), `type` (`user_real`, `user_bonus`, `house`, `gateway`), `userId` (opcional), `currency` (`USD`), `createdAt`.
- **LedgerTransaction**: Representa la agrupación atómica de asientos de partida doble. Atributos: `id`, `referenceCode`, `type` (`DEPOSIT`, `WITHDRAWAL`, `BET_STAKE`, `BET_PAYOUT`, `BONUS_GRANT`, `COMPENSATION`), `description`, `idempotencyKey`, `createdAt`.
- **LedgerEntry**: Asiento contable individual perteneciente a una transacción. Atributos: `id`, `transactionId`, `accountId`, `entryType` (`DEBIT` o `CREDIT`), `amount` (en centavos USD), `createdAt`.
- **Wallet**: Entidad raíz de control de concurrencia asociada al usuario. Atributos: `id`, `userId`, `currency`, `version`, `createdAt`, `updatedAt`.
- **PaymentIntent**: Registro de solicitud de recarga antes de la acreditación. Atributos: `id`, `userId`, `clientTransactionId`, `amount` (en centavos), `currency`, `status` (`PENDING`, `COMPLETED`, `REJECTED`, `EXPIRED`), `payphoneTransactionId`, `createdAt`, `updatedAt`.
- **AuditLog**: Bitácora inmutable de eventos financieros y de seguridad. Atributos: `id`, `userId`, `action`, `resource`, `details`, `ipAddress`, `createdAt`.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% de las transacciones financieras en la base de datos cumplen la regla de partida doble: la suma de créditos menos la suma de débitos de cada transacción es idénticamente cero.
- **SC-002**: En pruebas de estrés con N peticiones concurrentes de débito simultáneo compitiendo por un saldo limitado, 0% de sobregiros (cero saldos negativos) y el saldo final coincide exactamente con `saldo_inicial - (exitos * monto)`.
- **SC-003**: 100% de las pruebas de reintento con la misma clave de idempotencia retornan la respuesta previa y generan 0 asientos duplicados en el ledger contable.
- **SC-004**: 100% de los intentos de confirmación de Payphone con monto o moneda discrepante respecto a la intención son rechazados con HTTP 400/422 y generan un registro de auditoría.
- **SC-005**: La interfaz de usuario en `apps/web` renderiza correctamente el saldo y movimientos en pantallas móviles desde 360 px, pasa verificación de contraste WCAG 2.1 AA y no efectúa cálculos matemáticos de saldo en el cliente.
- **SC-006**: Todos los tests unitarios, de concurrencia y de integración en `packages/shared`, `apps/api` y `apps/web` pasan en verde (`pnpm test`).

---

## Assumptions & Boundaries

- La integración con Payphone se realiza estrictamente contra su entorno de pruebas (_sandbox_) conforme a la Constitución (proyecto académico sin dinero real).
- Se utiliza la moneda `USD` con representación interna en centavos enteros para evitar errores aritméticos.
- La autenticación en esta fase se apoya en el modelo de usuario y contexto de seguridad del backend NestJS; para pruebas automáticas se usan tokens y usuarios de prueba.
- Los retiros con Payphone en sandbox se manejarán en la Fase F6 conforme a `PLAN.md`; esta spec sienta las bases completas del ledger y los depósitos de Fase F2.
