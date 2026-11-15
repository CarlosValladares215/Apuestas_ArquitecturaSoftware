'use client';

import Link from 'next/link';
import { SyntheticEvent, useState } from 'react';
import type { AuthUserView } from '@apuestas/shared';
import { CaptchaChallenge } from '../../components/CaptchaChallenge';
import { SiteHeader } from '../../components/SiteHeader';
import { ApiClientError, loginAccount } from '../../lib/api-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<AuthUserView | null>(null);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    if (!captchaToken) {
      setErrorMessage('Completa la verificación anti-bots antes de iniciar sesión.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await loginAccount({
        email,
        password,
        captchaToken,
        ...(totpCode.trim() ? { totpCode: totpCode.trim() } : {}),
      });
      setActiveUser(response.user);
      setPassword('');
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('No fue posible conectar con el servidor de autenticación.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell">
      <SiteHeader currentPath="/login" />

      <main className="auth-layout">
        <section className="panel-card" aria-labelledby="login-heading">
          <h1 id="login-heading" className="hero-title">
            Iniciar sesión
          </h1>
          <p className="hero-copy">
            Autenticación exclusiva con cookies httpOnly seguras emitidas por el servidor. No se
            guardan tokens en localStorage ni sessionStorage.
          </p>

          <form
            className="stack-form"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            noValidate
          >
            <div className="field-group">
              <label htmlFor="login-email" className="field-label">
                Correo electrónico
              </label>
              <input
                id="login-email"
                type="email"
                className="field-input"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder="usuario@utpl.edu.ec"
              />
            </div>

            <div className="field-group">
              <label htmlFor="login-password" className="field-label">
                Contraseña
              </label>
              <input
                id="login-password"
                type="password"
                className="field-input"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </div>

            <div className="field-group">
              <label htmlFor="login-totp" className="field-label">
                Código 2FA TOTP (opcional si no está activo)
              </label>
              <input
                id="login-totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="field-input"
                value={totpCode}
                onChange={(event) => {
                  setTotpCode(event.target.value);
                }}
                placeholder="123456"
              />
            </div>

            <CaptchaChallenge
              id="login-captcha"
              checked={captchaVerified}
              onChange={(checked, token) => {
                setCaptchaVerified(checked);
                setCaptchaToken(token);
              }}
            />

            {errorMessage ? (
              <p role="alert" className="alert-error">
                {errorMessage}
              </p>
            ) : null}

            {activeUser ? (
              <div role="status" className="alert-success">
                <p>
                  Sesión activa para <strong>{activeUser.email}</strong> (rol: {activeUser.role}).
                </p>
                <div className="btn-row">
                  <Link href="/seguridad" className="btn-secondary">
                    Ir a Seguridad 2FA
                  </Link>
                  {activeUser.role === 'admin' ? (
                    <Link href="/admin/usuarios" className="btn-secondary">
                      Panel de Administración
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="btn-row">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Verificando...' : 'Iniciar sesión'}
              </button>
              <Link href="/registro" className="btn-secondary">
                Crear cuenta
              </Link>
            </div>
          </form>
        </section>

        <aside className="board-card" aria-labelledby="login-protection-heading">
          <h2 id="login-protection-heading" className="board-heading">
            Defensas antifraude en sesión
          </h2>
          <p className="board-subtitle">Validación continua en cada solicitud.</p>
          <ul className="principles-list">
            <li className="principle-item">
              <strong className="principle-title">Rotación con detección de reuso</strong>
              <p className="principle-desc">
                Cada renovación reemplaza el refresh token y revoca toda la familia si detecta copia
                previa.
              </p>
            </li>
            <li className="principle-item">
              <strong className="principle-title">Bloqueo temporal automático</strong>
              <p className="principle-desc">
                Cinco fallos consecutivos bloquean el acceso de forma temporal y auditan el evento.
              </p>
            </li>
          </ul>
        </aside>
      </main>
    </div>
  );
}
