'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { APP_ROLES, AppRole, AuditLogEntryView, AuthUserView } from '@apuestas/shared';
import { AppShell } from '../../../components/AppShell';
import {
  ApiClientError,
  fetchAdminAuditLogs,
  fetchAdminUsers,
  updateAdminUserRole,
} from '../../../lib/api-client';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AuthUserView[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [usersPage, auditPage] = await Promise.all([
        fetchAdminUsers(1, 20),
        fetchAdminAuditLogs(1, 20),
      ]);
      setUsers(usersPage.items);
      setAuditLogs(auditPage.items);
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        setErrorMessage(
          'Acceso denegado por el servidor: este panel requiere una sesión con rol admin.',
        );
      } else {
        setErrorMessage('No fue posible consultar usuarios y auditoría en el servidor.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  async function handleRoleChange(userId: string, nextRole: AppRole): Promise<void> {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await updateAdminUserRole(userId, nextRole);
      setUsers((prev) => prev.map((item) => (item.id === userId ? updated.user : item)));
      setStatusMessage(`Rol actualizado a ${updated.user.role} para ${updated.user.email}.`);
      const refreshedAudit = await fetchAdminAuditLogs(1, 20);
      setAuditLogs(refreshedAudit.items);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError ? error.message : 'No se pudo actualizar el rol.',
      );
    }
  }

  return (
    <AppShell currentPath="/admin/usuarios">
      <main className="admin-layout">
        <section className="panel-card" aria-labelledby="admin-heading">
          <h1 id="admin-heading" className="hero-title">
            Administración RBAC y Auditoría
          </h1>
          <p className="hero-copy">
            El acceso está protegido en el backend mediante JwtAuthGuard y RolesGuard denegados por
            defecto. Toda modificación de privilegios genera un registro append-only.
          </p>

          {loading ? <p>Consultando permisos y registros en servidor...</p> : null}

          {errorMessage ? (
            <div role="alert" className="alert-error">
              <p>{errorMessage}</p>
              <p>
                <Link href="/login">Iniciar sesión con cuenta administrativa</Link>
              </p>
            </div>
          ) : null}

          {statusMessage ? (
            <p role="status" className="alert-success">
              {statusMessage}
            </p>
          ) : null}
        </section>

        {users.length > 0 ? (
          <section className="panel-card" aria-labelledby="users-table-heading">
            <h2 id="users-table-heading" className="board-heading">
              Usuarios registrados
            </h2>
            <div className="responsive-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Correo</th>
                    <th scope="col">Verificado</th>
                    <th scope="col">2FA</th>
                    <th scope="col">Rol RBAC</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td>{item.email}</td>
                      <td>{item.emailVerified ? 'Sí' : 'Pendiente'}</td>
                      <td>{item.totpEnabled ? 'Activo' : 'Inactivo'}</td>
                      <td>
                        <label htmlFor={`role-${item.id}`} className="field-hint">
                          Rol de {item.email}
                        </label>
                        <select
                          id={`role-${item.id}`}
                          className="field-select"
                          value={item.role}
                          onChange={(event) => {
                            const selected = event.target.value as AppRole;
                            void handleRoleChange(item.id, selected);
                          }}
                        >
                          {APP_ROLES.map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                              {roleOption}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {auditLogs.length > 0 ? (
          <section className="panel-card" aria-labelledby="audit-table-heading">
            <h2 id="audit-table-heading" className="board-heading">
              Auditoría reciente (append-only)
            </h2>
            <div className="responsive-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Acción</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Objetivo</th>
                    <th scope="col">IP</th>
                    <th scope="col">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <code>{entry.action}</code>
                      </td>
                      <td>{entry.actorUserId ?? 'anónimo'}</td>
                      <td>{entry.targetId ?? '-'}</td>
                      <td>{entry.ipAddress ?? '-'}</td>
                      <td>{entry.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
