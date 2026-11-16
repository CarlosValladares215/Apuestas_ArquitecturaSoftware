# Data Model: 002-autenticacion-roles

## Esquema PostgreSQL (Prisma)

### 1. Enum `Role`

- `bettor`
- `operator`
- `admin`

### 2. Tabla `users` (`User`)

| Campo                   | Tipo PostgreSQL | Restricciones              | Descripción                              |
| ----------------------- | --------------- | -------------------------- | ---------------------------------------- |
| `id`                    | `uuid`          | PK, default `uuid()`       | Identificador único                      |
| `email`                 | `varchar(255)`  | UNIQUE, NOT NULL           | Correo normalizado (`lowercase`, `trim`) |
| `password_hash`         | `text`          | NOT NULL                   | Hash Argon2id                            |
| `role`                  | `Role`          | NOT NULL, default `bettor` | Rol RBAC asignado por servidor           |
| `adult_confirmed_at`    | `timestamptz`   | NOT NULL                   | Fecha/hora de declaración ≥ 18 años      |
| `email_verified_at`     | `timestamptz`   | NULL                       | Fecha de verificación de correo          |
| `totp_enabled`          | `boolean`       | NOT NULL, default `false`  | Estado de 2FA TOTP                       |
| `totp_secret_encrypted` | `text`          | NULL                       | Secreto TOTP cifrado AES-256-GCM         |
| `failed_login_attempts` | `integer`       | NOT NULL, default `0`      | Contador de fallos consecutivos          |
| `locked_until`          | `timestamptz`   | NULL                       | Fin del bloqueo temporal                 |
| `created_at`            | `timestamptz`   | NOT NULL                   | Fecha de creación                        |
| `updated_at`            | `timestamptz`   | NOT NULL                   | Fecha de actualización                   |

### 3. Tabla `email_verification_tokens` (`EmailVerificationToken`)

| Campo         | Tipo PostgreSQL | Restricciones                             | Descripción         |
| ------------- | --------------- | ----------------------------------------- | ------------------- |
| `id`          | `uuid`          | PK                                        | Identificador       |
| `user_id`     | `uuid`          | FK -> `users.id` ON DELETE CASCADE, INDEX | Usuario propietario |
| `token_hash`  | `varchar(64)`   | UNIQUE, NOT NULL                          | SHA-256 del token   |
| `expires_at`  | `timestamptz`   | NOT NULL                                  | Expiración          |
| `consumed_at` | `timestamptz`   | NULL                                      | Marca de uso único  |
| `created_at`  | `timestamptz`   | NOT NULL                                  | Emisión             |

### 4. Tabla `refresh_tokens` (`RefreshToken`)

| Campo                  | Tipo PostgreSQL | Restricciones                             | Descripción                   |
| ---------------------- | --------------- | ----------------------------------------- | ----------------------------- |
| `id`                   | `uuid`          | PK                                        | Identificador                 |
| `user_id`              | `uuid`          | FK -> `users.id` ON DELETE CASCADE, INDEX | Usuario propietario           |
| `family_id`            | `uuid`          | NOT NULL, INDEX                           | Familia de rotación de sesión |
| `token_hash`           | `varchar(64)`   | UNIQUE, NOT NULL                          | SHA-256 del token opaco       |
| `expires_at`           | `timestamptz`   | NOT NULL                                  | Expiración (7 días)           |
| `revoked_at`           | `timestamptz`   | NULL                                      | Fecha de revocación/rotación  |
| `replaced_by_token_id` | `uuid`          | NULL                                      | Siguiente token en la cadena  |
| `ip_address`           | `varchar(64)`   | NULL                                      | IP de origen                  |
| `user_agent`           | `text`          | NULL                                      | User-Agent de sesión          |
| `created_at`           | `timestamptz`   | NOT NULL                                  | Emisión                       |

### 5. Tabla `audit_logs` (`AuditLog` — Append-Only)

| Campo                | Tipo PostgreSQL | Restricciones                              | Descripción                                          |
| -------------------- | --------------- | ------------------------------------------ | ---------------------------------------------------- |
| `id`                 | `uuid`          | PK                                         | Identificador                                        |
| `actor_user_id`      | `uuid`          | FK -> `users.id` ON DELETE SET NULL, INDEX | Quién ejecutó la acción                              |
| `action`             | `varchar(64)`   | NOT NULL, INDEX                            | Acción (`AUTH_REGISTER`, `AUTH_LOGIN_SUCCESS`, etc.) |
| `target_type`        | `varchar(64)`   | NULL                                       | Recurso afectado                                     |
| `target_id`          | `varchar(128)`  | NULL                                       | ID del recurso afectado                              |
| `ip_address`         | `varchar(64)`   | NULL                                       | IP cliente                                           |
| `user_agent`         | `text`          | NULL                                       | Navegador/cliente                                    |
| `device_fingerprint` | `varchar(128)`  | NULL                                       | Huella opcional de dispositivo                       |
| `metadata`           | `jsonb`         | NULL                                       | Detalles no sensibles                                |
| `created_at`         | `timestamptz`   | NOT NULL, INDEX                            | Marca de tiempo inmutable                            |
