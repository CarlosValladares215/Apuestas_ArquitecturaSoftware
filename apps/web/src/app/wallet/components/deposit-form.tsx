'use client';

import React, { useEffect, useState } from 'react';
import { ConfirmDepositResponseDto, DepositIntentResponseDto } from '@apuestas/shared';
import { API_BASE_URL, ApiClientError, confirmDeposit } from '../../../lib/api-client';

interface DepositFormProps {
  onIntentCreated?: (intent: DepositIntentResponseDto) => void;
  onRefreshBalance: () => void;
}

export function DepositForm({ onIntentCreated, onRefreshBalance }: DepositFormProps) {
  const [amount, setAmount] = useState<string>('25.00');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<DepositIntentResponseDto | null>(null);

  const [confirmClientTxId, setConfirmClientTxId] = useState<string>('');
  const [payphoneTxId, setPayphoneTxId] = useState<string>('');
  const [confirming, setConfirming] = useState<boolean>(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmDepositResponseDto | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedClientTx = params.get('clientTransactionId') ?? params.get('clientTxId');
    const returnedPayphoneId = params.get('id');
    if (returnedClientTx) {
      setConfirmClientTxId(returnedClientTx);
    }
    if (returnedPayphoneId) {
      setPayphoneTxId(returnedPayphoneId);
    }
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmError(null);
    setConfirmResult(null);

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Por favor ingresa un monto válido mayor a 0');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/wallet/deposits/intent`, {
        method: 'POST',
        credentials: 'include',
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
      setConfirmClientTxId(data.clientTransactionId);
      if (onIntentCreated) {
        onIntentCreated(data);
      }
    } catch (err) {
      setError((err as Error).message || 'Error inesperado al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeposit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setConfirmError(null);
    setConfirmResult(null);

    const txRef = confirmClientTxId.trim();
    const gatewayTxId = payphoneTxId.trim();
    if (!txRef || !gatewayTxId) {
      setConfirmError('Ingresa la referencia de intención y el ID de transacción Payphone.');
      return;
    }

    setConfirming(true);
    try {
      const confirmed = await confirmDeposit(txRef, gatewayTxId);
      setConfirmResult(confirmed);
      onRefreshBalance();
    } catch (err) {
      setConfirmError(
        err instanceof ApiClientError
          ? err.message
          : 'No fue posible confirmar el depósito con el servidor.',
      );
    } finally {
      setConfirming(false);
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

      {intent || confirmClientTxId ? (
        <form
          onSubmit={(e) => {
            void handleConfirmDeposit(e);
          }}
          className="deposit-form"
          aria-label="Confirmación servidor a servidor con Payphone"
          noValidate
        >
          <div className="form-group">
            <label htmlFor="confirm-client-tx-input" className="form-label">
              Referencia de intención (clientTransactionId):
            </label>
            <input
              id="confirm-client-tx-input"
              type="text"
              className="field-input"
              value={confirmClientTxId}
              onChange={(e) => {
                setConfirmClientTxId(e.target.value);
              }}
              disabled={confirming}
            />
          </div>

          <div className="form-group">
            <label htmlFor="payphone-tx-input" className="form-label">
              ID de transacción Payphone:
            </label>
            <input
              id="payphone-tx-input"
              type="text"
              className="field-input"
              value={payphoneTxId}
              onChange={(e) => {
                setPayphoneTxId(e.target.value);
              }}
              disabled={confirming}
              placeholder="Ej. 8812345"
            />
          </div>

          {confirmError ? (
            <div role="alert" className="form-error-alert">
              {confirmError}
            </div>
          ) : null}

          {confirmResult ? (
            <div role="status" className="alert-success">
              Depósito acreditado: ${confirmResult.creditedAmount.toFixed(2)}{' '}
              {confirmResult.currency}. Nuevo saldo real: ${confirmResult.newRealBalance.toFixed(2)}{' '}
              {confirmResult.currency}.
            </div>
          ) : null}

          <button type="submit" className="btn-secondary" disabled={confirming}>
            {confirming ? 'Verificando con Payphone...' : 'Confirmar acreditación S2S'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
