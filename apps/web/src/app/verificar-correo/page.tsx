'use client';

import Link from 'next/link';
import { SyntheticEvent, useEffect, useState } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { ApiClientError, verifyEmailToken } from '../../lib/api-client';

export default function VerifyEmailPage() {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get('token');
    if (queryToken) {
      setToken(queryToken);
    }
  }, []);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setVerifiedEmail(null);

    if (!token.trim()) {
      setErrorMessage('Ingresa el token de verificación recibido por correo.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await verifyEmailToken(token.trim());
      setVerifiedEmail(response.user.email);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('No fue posible verificar el correo en este momento.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell">
      <SiteHeader currentPath="/verificar-correo" />

      <main className="auth-layout">
        <section className="panel-card" aria-labelledby="verify-heading">
          <h1 id="verify-heading" className="hero-title">
            Verificar correo electrónico
          </h1>
          <p className="hero-copy">
            Confirma el token de un solo uso para habilitar el inicio de sesión en tu cuenta.
          </p>

          <form
            className="stack-form"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            noValidate
          >
            <div className="field-group">
              <label htmlFor="verify-token" className="field-label">
                Token de verificación
              </label>
              <input
                id="verify-token"
                type="text"
                className="field-input"
                required
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                }}
                placeholder="Pega aquí tu token temporal"
              />
            </div>

            {errorMessage ? (
              <p role="alert" className="alert-error">
                {errorMessage}
              </p>
            ) : null}

            {verifiedEmail ? (
              <div role="status" className="alert-success">
                <p>Correo verificado correctamente para {verifiedEmail}.</p>
                <p>
                  <Link href="/login">Ir a iniciar sesión</Link>
                </p>
              </div>
            ) : null}

            <div className="btn-row">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Validando...' : 'Confirmar correo'}
              </button>
            </div>
          </form>
        </section>

        <aside className="board-card" aria-labelledby="verify-notes-heading">
          <h2 id="verify-notes-heading" className="board-heading">
            Token de un solo uso
          </h2>
          <p className="board-subtitle">
            Solo guardamos el digest SHA-256 en base de datos y caduca tras 24 horas.
          </p>
        </aside>
      </main>
    </div>
  );
}
