'use client';

import Link from 'next/link';
import { SyntheticEvent, useState } from 'react';
import { validatePasswordStrength } from '@apuestas/shared';
import { AppShell } from '../../components/AppShell';
import { CaptchaChallenge } from '../../components/CaptchaChallenge';
import { ApiClientError, registerAccount } from '../../lib/api-client';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdultConfirmed, setIsAdultConfirmed] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sandboxVerificationUrl, setSandboxVerificationUrl] = useState<string | null>(null);

  function toVerificationHref(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.pathname === '/verificar-correo') {
        return `${parsed.pathname}${parsed.search}`;
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSandboxVerificationUrl(null);

    if (!isAdultConfirmed) {
      setErrorMessage('Debes confirmar explícitamente que eres mayor de 18 años para registrarte.');
      return;
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      setErrorMessage(passwordCheck.errors.join(' '));
      return;
    }

    if (!captchaToken) {
      setErrorMessage('Completa la verificación anti-bots antes de continuar.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await registerAccount({
        email,
        password,
        isAdultConfirmed,
        captchaToken,
      });
      setSuccessMessage(response.message);
      setSandboxVerificationUrl(response.sandboxVerificationUrl ?? null);
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
    <AppShell currentPath="/registro">
      <main className="auth-layout">
        <section className="panel-card" aria-labelledby="register-heading">
          <h1 id="register-heading" className="hero-title">
            Crear cuenta en la plataforma
          </h1>
          <p className="hero-copy">
            Completa el formulario para registrarte. Toda cuenta nueva inicia como apostador y
            requiere verificar su correo antes de ingresar.
          </p>

          <div className="role-clarity-banner" role="note" aria-label="Rol asignado al registrarse">
            <span className="role-badge role-badge-bettor">Cuenta nueva: Apostador (bettor)</span>
            <span>
              Los roles <strong>Operador</strong> y <strong>Administrador</strong> solo los asigna
              internamente un Administrador.
            </span>
          </div>

          <form
            className="stack-form"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            noValidate
          >
            <div className="field-group">
              <label htmlFor="register-email" className="field-label">
                Correo electrónico
              </label>
              <input
                id="register-email"
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
              <label htmlFor="register-password" className="field-label">
                Contraseña segura
              </label>
              <input
                id="register-password"
                type="password"
                className="field-input"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
              <small className="field-hint">
                Mínimo 10 caracteres, combinando mayúscula, minúscula y dígito numérico.
              </small>
            </div>

            <div className="check-card">
              <label htmlFor="register-adult" className="check-label">
                <input
                  id="register-adult"
                  type="checkbox"
                  className="check-input"
                  checked={isAdultConfirmed}
                  onChange={(event) => {
                    setIsAdultConfirmed(event.target.checked);
                  }}
                />
                <span>
                  <strong>Confirmo que soy mayor de 18 años</strong>
                  <small className="field-hint">
                    Declaración académica obligatoria verificada y auditada en el servidor.
                  </small>
                </span>
              </label>
            </div>

            <CaptchaChallenge
              id="register-captcha"
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

            {successMessage ? (
              <div role="status" className="alert-success">
                <p>{successMessage}</p>
                {sandboxVerificationUrl ? (
                  <p>
                    Modo sandbox sin correo externo:{' '}
                    <Link href={toVerificationHref(sandboxVerificationUrl)}>
                      Abrir enlace directo de verificación
                    </Link>
                  </p>
                ) : null}
                <p>
                  <Link href="/verificar-correo">Continuar a verificación de correo</Link>
                </p>
              </div>
            ) : null}

            <div className="btn-row">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Registrando...' : 'Crear cuenta'}
              </button>
              <Link href="/login" className="btn-secondary">
                Ya tengo cuenta
              </Link>
            </div>
          </form>
        </section>

        <aside className="board-card" aria-labelledby="register-security-notes">
          <h2 id="register-security-notes" className="board-heading">
            Garantías de registro
          </h2>
          <p className="board-subtitle">Controles activos desde el servidor en Spec 002.</p>
          <ul className="principles-list">
            <li className="principle-item">
              <strong className="principle-title">Hash Argon2id</strong>
              <p className="principle-desc">
                Tu contraseña nunca se almacena ni viaja en claro fuera de la petición TLS.
              </p>
            </li>
            <li className="principle-item">
              <strong className="principle-title">Sin privilegios autoinyectados</strong>
              <p className="principle-desc">
                El rol se fija en servidor a bettor y cada intento queda registrado en auditoría.
              </p>
            </li>
          </ul>
        </aside>
      </main>
    </AppShell>
  );
}
