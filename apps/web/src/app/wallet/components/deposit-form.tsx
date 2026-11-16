'use client';

import React, { useState } from 'react';
import { DepositIntentResponseDto } from '@apuestas/shared';

interface DepositFormProps {
  onIntentCreated?: (intent: DepositIntentResponseDto) => void;
  onRefreshBalance: () => void;
}

export function DepositForm({ onIntentCreated, onRefreshBalance }: DepositFormProps) {
  const [amount, setAmount] = useState<string>('25.00');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<DepositIntentResponseDto | null>(null);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Por favor ingresa un monto válido mayor a 0');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v1/wallet/deposits/intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `web_intent_${String(Date.now())}`,
        },
        body: JSON.stringify({
          amount: numericAmount,
          currency: 'USD',
        }),
      });

      if (!response.ok) {
        throw new Error(`Error en el servidor al generar intención: ${String(response.status)}`);
      }

      const data = (await response.json()) as DepositIntentResponseDto;
      setIntent(data);
      if (onIntentCreated) {
        onIntentCreated(data);
      }
    } catch (err) {
      setError((err as Error).message || 'Error inesperado al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="board-card" aria-labelledby="deposit-heading">
      <h2 id="deposit-heading" className="board-heading">
        Recargar Saldo (Payphone Sandbox)
      </h2>
      <p className="board-subtitle">
        Entorno de pruebas académicas sin dinero real. La acreditación solo ocurre tras la
        confirmación verificada servidor a servidor; el regreso del navegador no acredita saldo por
        sí solo.
      </p>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="deposit-form"
        noValidate
      >
        <div className="form-group">
          <label htmlFor="amount-input" className="form-label">
            Monto a recargar (USD):
          </label>
          <div className="input-affix-wrapper">
            <span className="currency-prefix" aria-hidden="true">
              $
            </span>
            <input
              id="amount-input"
              type="number"
              step="0.01"
              min="1"
              max="1000"
              required
              className="input-text"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
              disabled={loading}
              aria-describedby="amount-hint"
            />
          </div>
          <span id="amount-hint" className="form-hint">
            Mínimo $1.00 USD. Máximo por transacción $1,000.00 USD.
          </span>
        </div>

        {error && (
          <div role="alert" className="form-error-alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
          {loading ? 'Generando intención...' : 'Iniciar Depósito'}
        </button>
      </form>

      {intent && (
        <div className="intent-result-box" aria-live="polite">
          <div className="intent-badge-row">
            <span className="status-badge pending">{intent.status}</span>
            <span className="intent-title">Intención de Pago Generada</span>
          </div>

          <div className="intent-details">
            <p>
              <strong>Referencia:</strong>{' '}
              <code className="code-tag">{intent.clientTransactionId}</code>
            </p>
            <p>
              <strong>Monto:</strong> ${intent.amount.toFixed(2)} {intent.currency}
            </p>
          </div>

          <div className="intent-actions">
            {intent.payphoneUrl && (
              <a
                href={intent.payphoneUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-external"
              >
                Abrir Pasarela Payphone Sandbox ↗
              </a>
            )}
            <button type="button" className="btn-secondary" onClick={onRefreshBalance}>
              Comprobar Acreditación
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
