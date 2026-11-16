import React from 'react';
import { WalletMovementDto } from '@apuestas/shared';

interface MovementsTableProps {
  movements: WalletMovementDto[];
  total: number;
  loading: boolean;
  onRefresh: () => void;
}

export function MovementsTable({ movements, total, loading, onRefresh }: MovementsTableProps) {
  return (
    <section className="board-card full-width" aria-labelledby="movements-heading">
      <div className="wallet-card-header">
        <div>
          <h2 id="movements-heading" className="board-heading">
            Historial de Movimientos del Ledger
          </h2>
          <p className="board-subtitle">
            Registro inmutable append-only ({total} movimientos encontrados)
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="btn-secondary"
          disabled={loading}
          aria-label="Actualizar movimientos del ledger"
        >
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {movements.length === 0 ? (
        <div className="empty-state">
          <p>No hay movimientos registrados en el ledger contable.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="movements-table" aria-label="Tabla de movimientos contables">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col">Cuenta</th>
                <th scope="col">Referencia</th>
                <th scope="col">Descripción</th>
                <th scope="col" className="text-right">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody>
              {movements.map((mov) => {
                const isCredit = mov.entryType === 'CREDIT';
                const formattedDate = new Date(mov.createdAt).toLocaleString('es-EC', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                });

                return (
                  <tr key={mov.id}>
                    <td className="text-muted">{formattedDate}</td>
                    <td>
                      <span className={`type-tag ${mov.type.toLowerCase()}`}>{mov.type}</span>
                    </td>
                    <td>
                      <span className="account-tag">{mov.accountType}</span>
                    </td>
                    <td>
                      <code className="code-tag">{mov.referenceCode}</code>
                    </td>
                    <td>{mov.description}</td>
                    <td
                      className={`text-right font-mono ${isCredit ? 'amount-credit' : 'amount-debit'}`}
                    >
                      {isCredit ? '+' : '-'}${mov.amount.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
