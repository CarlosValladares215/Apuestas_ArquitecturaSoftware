# Research: 003-billetera-ledger

## Decisiones Técnicas Investigadas y Validadas

### 1. Modelo Contable de Partida Doble Inmutable

- **Decisión**: Implementar un libro diario mayor (general ledger) de partida doble donde cada transacción agrupa un conjunto de asientos (`LedgerEntry`) estrictamente balanceados:
  $$\sum \text{Monto}(\text{Créditos}) - \sum \text{Monto}(\text{Débitos}) = 0$$
- **Estructura de Cuentas**:
  - `user_real:{userId}`: Fondos reales disponibles del usuario. Aumenta con depósitos y premios de apuestas; disminuye con débitos para apuestas y retiros.
  - `user_bonus:{userId}`: Fondos de bonificación del usuario. Separados contablemente de los fondos reales (Principio II de la Constitución).
  - `house:main`: Cuenta de fondos operativos y ganancias de la casa.
  - `gateway:payphone`: Cuenta puente de compensación con la pasarela de pagos.
- **Derivación de Saldos**:
  Para cualquier cuenta de usuario, el saldo no se almacena como una columna editable. Se deriva mediante la consulta:
  ```sql
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END), 0)
  FROM ledger_entries
  WHERE account_id = :accountId;
  ```
- **Inmutabilidad Absoluta**:
  Las tablas `ledger_transactions` y `ledger_entries` son de solo inserción (append-only). En PostgreSQL, se asegura mediante triggers o políticas de denegación de `UPDATE` y `DELETE`. Cualquier error operativo o reversión se efectúa mediante una transacción de tipo `COMPENSATION` con los asientos contables opuestos y referencia a la transacción original.

---

### 2. Control de Concurrencia y Prevención de Doble Gasto

- **Problema**: Múltiples solicitudes de débito ejecutadas simultáneamente (p. ej., varias apuestas en ráfaga o un ataque concurrente) leen el mismo saldo disponible antes de que cualquiera se descuente, causando un sobregiro financiero o doble gasto.
- **Decisión**: Serialización de operaciones a nivel de billetera mediante transacción ACID con bloqueo pesimista:
  - En PostgreSQL: `SELECT id FROM wallets WHERE user_id = :userId FOR UPDATE`. Esto bloquea la fila del usuario hasta que la transacción actual confirme (`COMMIT`) o revierta (`ROLLBACK`).
  - En la capa de aplicación / repositorio: Un mecanismo de sincronización transaccional (mutex atómico por `userId`) garantiza que en pruebas en memoria o ráfagas asíncronas de Node.js, las operaciones concurrentes sobre la misma billetera se ejecuten en secuencia estricta, verificando el saldo derivado actualizado antes de permitir el siguiente débito.
- **Alternativas descartadas**:
  - _Bloqueo optimista con versión_: Requiere reintentar transacciones que colisionan, lo que bajo alta concurrencia en apuestas en vivo deteriora la latencia y genera rechazos innecesarios al usuario.
  - _Actualización directa `UPDATE wallets SET balance = balance - :amount WHERE balance >= :amount`_: Viola el Principio II de la Constitución, pues el saldo no provendría de asientos del ledger.

---

### 3. Claves de Idempotencia (Idempotency Keys)

- **Decisión**: Toda mutación financiera (`POST /wallet/deposits/intent`, `POST /wallet/deposits/confirm`, `POST /wallet/debit`) exige un identificador único de idempotencia (`Idempotency-Key` en encabezado HTTP o `idempotencyKey` en payload).
- **Mecanismo**:
  - La clave de idempotencia se almacena asociada a la transacción con restricción de unicidad (`UNIQUE CONSTRAINT`).
  - Al recibir una solicitud con una clave ya procesada:
    1. Si la operación previa terminó exitosamente, se retorna la respuesta almacenada sin reejecutar lógica de negocio ni crear nuevos asientos contables.
    2. Si la operación previa falló de manera recuperable, se responde el estado correspondiente.
  - Esto evita dobles depósitos por reintentos de red de la pasarela y dobles cobros de apuestas por clics repetidos del usuario.

---

### 4. Protocolo de Integración con Payphone Sandbox (Servidor a Servidor)

- **Entorno**: Sandbox oficial de Payphone (`https://pay.payphonetodoesposible.com`).
- **Flujo en Dos Fases**:
  1. **Fase 1: Preparación / Intención (`POST /api/v1/wallet/deposits/intent`)**:
     - El cliente solicita depositar una cantidad en USD.
     - El backend genera un `clientTransactionId` único (formato UUID o prefijo `DEP-{timestamp}-{random}`).
     - Registra una entidad `PaymentIntent` en estado `PENDING` con el monto exacto en centavos.
     - Retorna los metadatos necesarios para abrir la pasarela Payphone (URL de pago / sandbox token).
     - **Invariante**: En esta fase no se acredita ningún centavo al usuario.
  2. **Fase 2: Confirmación Servidor a Servidor (`POST /api/v1/wallet/deposits/confirm`)**:
     - Al completar el pago en Payphone Sandbox, el backend consulta o recibe la confirmación llamando al endpoint oficial de Payphone `/api/button/V2/Confirm`.
     - El backend valida estrictamente los siguientes cuatro puntos:
       a) Estado retornado por Payphone es `Approved` (o código de estado de éxito 3).
       b) `amount` confirmado por Payphone coincide **exactamente** con `intent.amount` (en centavos).
       c) `currency` confirmado es `USD`.
       d) `clientTransactionId` coincide con el registrado en la intención.
     - Solo cuando las cuatro condiciones se cumplen, se ejecuta la transacción atómica que:
       - Cambia el estado de `PaymentIntent` a `COMPLETED`.
       - Inserta la transacción contable `DEPOSIT` con Débito a `gateway:payphone` y Crédito a `user_real:{userId}`.
       - Registra el evento en `audit_logs`.
- **Por qué el Redirect del Navegador es Cero Confiable**:
  - La redirección HTTP del navegador puede ser interceptada, simulada o modificada por un usuario malicioso enviando parámetros falsos (`?status=Approved&amount=1000000`).
  - Por tanto, la página de retorno en `apps/web` únicamente invoca a `GET /api/v1/wallet/balance` para reflejar el estado que el servidor ya validó de forma independiente.

---

### 5. Seguridad y Mitigación de Vectores de Fraude

| Vector de Fraude                                   | Impacto Potencial                                | Mitigación Implementada                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Manipulación de respuesta de pasarela (Tampering)  | Acreditar \$100 habiendo pagado \$1              | Validación estricta servidor a servidor de monto, moneda y referencia contra el `PaymentIntent` persistido.             |
| Inyección de fondos desde el cliente               | Modificación del DOM o llamada directa a API     | Ningún endpoint del cliente puede sumar saldo; los endpoints de confirmación exigen token y validación contra Payphone. |
| Doble gasto por concurrencia                       | Apostar \$50 dos veces con solo \$50 disponibles | Bloqueo pesimista de fila (`SELECT ... FOR UPDATE`) y mutex transaccional por billetera.                                |
| Reintento masivo de confirmaciones (Replay attack) | Múltiples acreditaciones de un mismo pago        | Clave de idempotencia única ligada al ID de transacción de Payphone; rechazo automático de duplicados.                  |
| Sobregiro por saldo insuficiente                   | Apostar con saldo \$0                            | Validación atómica de saldo derivado dentro de la transacción de débito; rechazo `INSUFFICIENT_FUNDS`.                  |
| Modificación no autorizada de registros históricos | Alterar asientos pasados para inventar dinero    | Esquema inmutable append-only; solo se admiten asientos compensatorios para ajustes.                                    |
