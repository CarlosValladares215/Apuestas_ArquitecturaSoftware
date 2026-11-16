# Data Model: Ledger Contable Inmutable, Billetera y Depósitos Payphone

## Diagrama Entidad-Relación Conceptual

```
┌─────────────────────────────────┐
│             Wallet              │
├─────────────────────────────────┤
│ id (PK, UUID)                   │
│ user_id (UNIQUE, VARCHAR)       │
│ currency (VARCHAR, 'USD')       │
│ version (INT)                   │
│ created_at (TIMESTAMP)          │
│ updated_at (TIMESTAMP)          │
└────────────────┬────────────────┘
                 │ 1:N
                 ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│          LedgerAccount          │       │        LedgerTransaction        │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id (PK, UUID)                   │       │ id (PK, UUID)                   │
│ code (UNIQUE, VARCHAR)          │       │ reference_code (VARCHAR)        │
│ type (VARCHAR: user_real, ...)  │       │ type (VARCHAR: DEPOSIT, ...)    │
│ user_id (NULLABLE, VARCHAR)     │       │ description (TEXT)              │
│ currency (VARCHAR, 'USD')       │       │ idempotency_key (UNIQUE, VARCHAR│
│ created_at (TIMESTAMP)          │       │ created_at (TIMESTAMP)          │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │ 1                              1 │
                 │                                  │
                 │          ┌───────────────────────┘
                 ▼          ▼
┌─────────────────────────────────┐
│           LedgerEntry           │ (Append-Only / Inmutable)
├─────────────────────────────────┤
│ id (PK, UUID)                   │
│ transaction_id (FK, UUID)       │
│ account_id (FK, UUID)           │
│ entry_type (DEBIT / CREDIT)     │
│ amount (BIGINT, centavos USD)   │
│ created_at (TIMESTAMP)          │
└─────────────────────────────────┘

┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│          PaymentIntent          │       │            AuditLog             │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id (PK, UUID)                   │       │ id (PK, UUID)                   │
│ user_id (VARCHAR)               │       │ user_id (NULLABLE, VARCHAR)     │
│ client_transaction_id (UNIQUE)  │       │ action (VARCHAR)                │
│ amount (BIGINT, centavos USD)   │       │ resource (VARCHAR)              │
│ currency (VARCHAR, 'USD')       │       │ details (JSONB / TEXT)          │
│ status (PENDING, COMPLETED, ...)│       │ ip_address (VARCHAR)            │
│ payphone_tx_id (NULLABLE)       │       │ created_at (TIMESTAMP)          │
│ created_at (TIMESTAMP)          │       └─────────────────────────────────┘
│ updated_at (TIMESTAMP)          │
└─────────────────────────────────┘
```

---

## Detalle de Entidades

### 1. `Wallet` (Entidad de Control y Bloqueo de Fila)

Representa la billetera lógica del usuario y actúa como el recurso objetivo para el bloqueo pesimista (`SELECT ... FOR UPDATE`) durante operaciones financieras concurrentes.

| Campo       | Tipo          | Restricciones             | Descripción                           |
| ----------- | ------------- | ------------------------- | ------------------------------------- |
| `id`        | `UUID`        | PK, Not Null              | Identificador único de la billetera   |
| `userId`    | `VARCHAR(64)` | Unique, Not Null          | Identificador del usuario propietario |
| `currency`  | `VARCHAR(3)`  | Not Null, Default `'USD'` | Moneda estándar de la cuenta          |
| `version`   | `INTEGER`     | Not Null, Default `1`     | Versión incremental para auditoría    |
| `createdAt` | `TIMESTAMP`   | Not Null, Default `NOW()` | Fecha de creación                     |
| `updatedAt` | `TIMESTAMP`   | Not Null, Default `NOW()` | Fecha de última modificación          |

---

### 2. `LedgerAccount` (Plan de Cuentas Contables)

Alberga las cuentas que intervienen en las transacciones de partida doble.

| Campo       | Tipo           | Restricciones             | Descripción                                                                       |
| ----------- | -------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `id`        | `UUID`         | PK, Not Null              | Identificador único de la cuenta contable                                         |
| `code`      | `VARCHAR(128)` | Unique, Not Null          | Código contable legible (ej. `user_real:usr_1`, `house:main`, `gateway:payphone`) |
| `type`      | `VARCHAR(32)`  | Not Null                  | Tipo de cuenta (`user_real`, `user_bonus`, `house`, `gateway`)                    |
| `userId`    | `VARCHAR(64)`  | Nullable                  | ID del usuario si es cuenta de usuario; null si es cuenta de la casa o pasarela   |
| `currency`  | `VARCHAR(3)`   | Not Null, Default `'USD'` | Moneda de la cuenta                                                               |
| `createdAt` | `TIMESTAMP`    | Not Null, Default `NOW()` | Fecha de registro                                                                 |

---

### 3. `LedgerTransaction` (Agrupador de Partida Doble)

Encapsula una operación financiera atómica que contiene dos o más asientos contables balanceados.

| Campo            | Tipo           | Restricciones             | Descripción                                                                              |
| ---------------- | -------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `id`             | `UUID`         | PK, Not Null              | Identificador único de la transacción contable                                           |
| `referenceCode`  | `VARCHAR(128)` | Not Null                  | Código de referencia de negocio (ej. `DEP-1731700000-XYZ`)                               |
| `type`           | `VARCHAR(32)`  | Not Null                  | Tipo (`DEPOSIT`, `WITHDRAWAL`, `BET_STAKE`, `BET_PAYOUT`, `BONUS_GRANT`, `COMPENSATION`) |
| `description`    | `VARCHAR(255)` | Not Null                  | Descripción clara del movimiento                                                         |
| `idempotencyKey` | `VARCHAR(128)` | Unique, Not Null          | Clave de idempotencia única para prevenir repetición                                     |
| `createdAt`      | `TIMESTAMP`    | Not Null, Default `NOW()` | Marca de tiempo inmutable de la operación                                                |

---

### 4. `LedgerEntry` (Asiento Contable Append-Only)

Asiento contable elemental. Una transacción tiene débitos y créditos cuyo balance suma cero.

| Campo           | Tipo         | Restricciones                           | Descripción                                |
| --------------- | ------------ | --------------------------------------- | ------------------------------------------ |
| `id`            | `UUID`       | PK, Not Null                            | Identificador único del asiento contable   |
| `transactionId` | `UUID`       | FK -> `LedgerTransaction(id)`, Not Null | Transacción a la que pertenece             |
| `accountId`     | `UUID`       | FK -> `LedgerAccount(id)`, Not Null     | Cuenta contable afectada                   |
| `entryType`     | `VARCHAR(8)` | Not Null (`DEBIT` o `CREDIT`)           | Sentido del movimiento                     |
| `amount`        | `BIGINT`     | Not Null, Check (`amount > 0`)          | Monto monetario en centavos enteros de USD |
| `createdAt`     | `TIMESTAMP`  | Not Null, Default `NOW()`               | Fecha y hora inmutable de creación         |

---

### 5. `PaymentIntent` (Intención de Pago Payphone)

Registra las solicitudes de depósito pendientes antes de su confirmación servidor a servidor.

| Campo                   | Tipo           | Restricciones                                            | Descripción                                                |
| ----------------------- | -------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `id`                    | `UUID`         | PK, Not Null                                             | Identificador de la intención                              |
| `userId`                | `VARCHAR(64)`  | Not Null                                                 | Usuario que solicitó el depósito                           |
| `clientTransactionId`   | `VARCHAR(128)` | Unique, Not Null                                         | Identificador entregado a Payphone para tracking           |
| `amount`                | `BIGINT`       | Not Null, Check (`amount > 0`)                           | Monto en centavos enteros solicitado                       |
| `currency`              | `VARCHAR(3)`   | Not Null, Default `'USD'`                                | Moneda solicitada                                          |
| `status`                | `VARCHAR(32)`  | Not Null (`PENDING`, `COMPLETED`, `REJECTED`, `EXPIRED`) | Estado de la intención                                     |
| `payphoneTransactionId` | `VARCHAR(128)` | Nullable                                                 | ID retornado por la pasarela Payphone tras la confirmación |
| `createdAt`             | `TIMESTAMP`    | Not Null, Default `NOW()`                                | Fecha de generación                                        |
| `updatedAt`             | `TIMESTAMP`    | Not Null, Default `NOW()`                                | Fecha de actualización                                     |

---

### 6. `AuditLog` (Bitácora de Auditoría Financiera)

Registro inmutable de todas las acciones sensibles, fallos de seguridad e intentos de manipulación.

| Campo       | Tipo             | Restricciones             | Descripción                                                             |
| ----------- | ---------------- | ------------------------- | ----------------------------------------------------------------------- |
| `id`        | `UUID`           | PK, Not Null              | Identificador del log                                                   |
| `userId`    | `VARCHAR(64)`    | Nullable                  | Usuario involucrado o null si fue petición no autenticada               |
| `action`    | `VARCHAR(64)`    | Not Null                  | Acción ejecutada (ej. `WALLET_DEPOSIT_CONFIRMED`, `TAMPERING_DETECTED`) |
| `resource`  | `VARCHAR(64)`    | Not Null                  | Recurso afectado (ej. `wallet`, `payment_intent`)                       |
| `details`   | `TEXT` / `JSONB` | Not Null                  | Datos contextuales (montos, diferencias, payloads)                      |
| `ipAddress` | `VARCHAR(45)`    | Nullable                  | Dirección IP del cliente                                                |
| `createdAt` | `TIMESTAMP`      | Not Null, Default `NOW()` | Fecha/hora del evento                                                   |
