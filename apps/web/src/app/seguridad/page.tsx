'use client';

import Link from 'next/link';
import { SyntheticEvent, useCallback, useEffect, useState } from 'react';
import type { AuthUserView, TotpSetupResponse } from '@apuestas/shared';
import { AppShell } from '../../components/AppShell';
import { useSession } from '../../context/session-context';
import {
  ApiClientError,
  enableTotp,
  fetchCurrentUser,
  logoutAccount,
  refreshSession,
  setupTotp,
} from '../../lib/api-client';

export default function SecurityPage() {
  const { setSessionUser } = useSession();
  const [user, setUser] = useState<AuthUserView | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<TotpSetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const profile = await fetchCurrentUser();
      setUser(profile.user);
    } catch (error) {
      setUser(null);
      if (error instanceof ApiClientError && error.status === 401) {
        setErrorMessage('Inicia sesión para gestionar tu autenticación de dos factores (2FA).');
      } else {
        setErrorMessage('No se pudo cargar tu estado de seguridad desde el servidor.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function handleSetupTotp(): Promise<void> {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const setup = await setupTotp();
      setEnrollment(setup);
      setStatusMessage('Escanea el URI o ingresa el secreto manualmente en tu app TOTP.');
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError
          ? error.message
          : 'No se pudo generar el secreto de configuración 2FA.',
      );
    }
  }

  async function handleEnableTotp(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await enableTotp(totpCode.trim());
      setUser(response.user);
      setSessionUser(response.user);
      setEnrollment(null);
      setTotpCode('');
      setStatusMessage('2FA TOTP activado correctamente.');
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError
          ? error.message
          : 'No fue posible validar el código TOTP ingresado.',
      );
    }
  }

  async function handleRefresh(): Promise<void> {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const renewed = await refreshSession();
      setUser(renewed.user);
      setSessionUser(renewed.user);
      setStatusMessage('Par de cookies httpOnly rotado correctamente en el servidor.');
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError ? error.message : 'No fue posible renovar la sesión.',
      );
    }
  }

  async function handleLogout(): Promise<void> {
    setErrorMessage(null);
    try {
      await logoutAccount();
      setUser(null);
      setSessionUser(null);
      setEnrollment(null);
      setStatusMessage('Sesión cerrada y refresh token revocado.');
    } catch {
      setErrorMessage('Error cerrando sesión en el servidor.');
    }
  }

  return (
    <AppShell currentPath="/seguridad">
      <main className="auth-layout">
        <section className="panel-card" aria-labelledby="security-heading">
          <h1 id="security-heading" className="hero-title">
            Seguridad de cuenta y 2FA TOTP
          </h1>
          <p className="hero-copy">
            El secreto TOTP se almacena cifrado con AES-256-GCM en el servidor y protege futuros
            inicios de sesión y retiros financieros.
          </p>

          {loading ? <p>Consultando sesión activa...</p> : null}

          {errorMessage ? (
            <p role="alert" className="alert-error">
              {errorMessage}
            </p>
          ) : null}

          {statusMessage ? (
            <p role="status" className="alert-success">
              {statusMessage}
            </p>
          ) : null}

          {user ? (
            <div className="stack-form">
              <div className="check-card">
                <p>
                  <strong>Cuenta:</strong> {user.email}
                </p>
                <p>
                  <strong>Rol servidor:</strong> {user.role} · <strong>2FA TOTP:</strong>{' '}
                  {user.totpEnabled ? 'Activo' : 'Inactivo'}
                </p>
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    void handleSetupTotp();
                  }}
                >
                  Generar secreto 2FA
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    void handleRefresh();
                  }}
                >
                  Rotar sesión
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  Cerrar sesión
                </button>
              </div>

              {enrollment ? (
                <div className="stack-form">
                  <div className="field-group">
                    <span className="field-label">Secreto Base32</span>
                    <p className="mono-box">{enrollment.secret}</p>
                  </div>
                  <div className="field-group">
                    <span className="field-label">URI otpauth://</span>
                    <p className="mono-box">{enrollment.otpauthUri}</p>
                  </div>

                  <form
                    className="stack-form"
                    onSubmit={(event) => {
                      void handleEnableTotp(event);
                    }}
                    noValidate
                  >
                    <div className="field-group">
                      <label htmlFor="totp-enable-code" className="field-label">
                        Código de verificación de 6 dígitos
                      </label>
                      <input
                        id="totp-enable-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className="field-input"
                        required
                        value={totpCode}
                        onChange={(event) => {
                          setTotpCode(event.target.value);
                        }}
                        placeholder="654321"
                      />
                    </div>
                    <button type="submit" className="btn-primary">
                      Activar 2FA
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ) : !loading ? (
            <div className="btn-row">
              <Link href="/login" className="btn-primary">
                Ir a iniciar sesión
              </Link>
            </div>
          ) : null}
        </section>

        <aside className="board-card" aria-labelledby="security-side-heading">
          <h2 id="security-side-heading" className="board-heading">
            Política de credenciales
          </h2>
          <p className="board-subtitle">Estándar RFC 6238 con ventana de tolerancia ±1.</p>
          <p className="principle-desc">
            Si aún no has iniciado sesión, el backend responderá HTTP 401 sin exponer datos de
            ninguna cuenta.
          </p>
        </aside>
      </main>
    </AppShell>
  );
}
