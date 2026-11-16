import React from 'react';
import { WalletBalance } from '@apuestas/shared';

interface BalanceCardProps {
  balance: WalletBalance | null;
  loading: boolean;
}

export function BalanceCard({ balance, loading }: BalanceCardProps) {
  if (loading) {
    return (
      <section className="board-card" aria-labelledby="balance-heading" aria-busy="true">
        <h2 id="balance-heading" className="board-heading">
          Saldos Disponibles
        </h2>
        <p className="board-subtitle">Consultando ledger contable...</p>
      </section>
    );
  }

  const real = balance?.realBalance ?? 0;
  const bonus = balance?.bonusBalance ?? 0;
  const total = balance?.totalBalance ?? 0;

  return (
    <section className="board-card" aria-labelledby="balance-heading">
      <div className="wallet-card-header">
        <div>
          <h2 id="balance-heading" className="board-heading">
            Saldos Disponibles
          </h2>
          <p className="board-subtitle">
            Derivados exclusivamente del libro contable (ledger de doble entrada)
          </p>
        </div>
        <span className="version-tag">Moneda: USD</span>
      </div>

      <div className="balance-grid">
        <div className="balance-item real">
          <span className="balance-label">Saldo Real</span>
          <span className="balance-value">${real.toFixed(2)}</span>
          <span className="balance-note">Fondos depositados y ganancias</span>
        </div>

        <div className="balance-item bonus">
          <span className="balance-label">Saldo de Bono</span>
          <span className="balance-value">${bonus.toFixed(2)}</span>
          <span className="balance-note">Cuenta de bonificación separada</span>
        </div>

        <div className="balance-item total">
          <span className="balance-label">Saldo Total</span>
          <span className="balance-value total-val">${total.toFixed(2)}</span>
          <span className="balance-note">Disponible para apuestas</span>
        </div>
      </div>
    </section>
  );
}
