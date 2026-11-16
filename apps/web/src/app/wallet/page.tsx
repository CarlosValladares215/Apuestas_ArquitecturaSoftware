'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { WalletBalance, WalletMovementDto } from '@apuestas/shared';
import { BalanceCard } from './components/balance-card';
import { DepositForm } from './components/deposit-form';
import { MovementsTable } from './components/movements-table';

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [movements, setMovements] = useState<WalletMovementDto[]>([]);
  const [totalMovements, setTotalMovements] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState<boolean>(true);
  const [loadingMovements, setLoadingMovements] = useState<boolean>(true);

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const res = await fetch('/api/v1/wallet/balance');
      if (res.ok) {
        const data = (await res.json()) as WalletBalance;
        setBalance(data);
      }
    } catch {
      // Handled gracefully in UI
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true);
    try {
      const res = await fetch('/api/v1/wallet/movements?limit=20&offset=0');
      if (res.ok) {
        const data = (await res.json()) as {
          movements: WalletMovementDto[];
          total: number;
        };
        setMovements(data.movements);
        setTotalMovements(data.total);
      }
    } catch {
      // Handled gracefully in UI
    } finally {
      setLoadingMovements(false);
    }
  }, []);

  useEffect(() => {
    void fetchBalance();
    void fetchMovements();
  }, [fetchBalance, fetchMovements]);

  const handleRefreshAll = () => {
    void fetchBalance();
    void fetchMovements();
  };

  return (
    <div className="page-shell">
      <header className="topbar" role="banner">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Ir al inicio de Apuestas Deportivas">
            Apuestas Deportivas
          </Link>
          <div className="topbar-nav">
            <Link href="/" className="nav-link">
              Inicio
            </Link>
            <span className="version-tag">Fase F2: Billetera y Ledger</span>
          </div>
        </div>
      </header>

      <main className="main-container wallet-layout" id="main-content">
        <header className="wallet-header">
          <h1 className="hero-title">Billetera y Ledger Contable</h1>
          <p className="hero-copy">
            Gestión financiera con libro contable inmutable de doble entrada. Saldo derivado en el
            servidor sin mutaciones directas y depósitos verificados mediante Payphone Sandbox.
          </p>
        </header>

        <div className="wallet-grid">
          <div className="wallet-col-left">
            <BalanceCard balance={balance} loading={loadingBalance} />
            <DepositForm
              onRefreshBalance={handleRefreshAll}
              onIntentCreated={() => {
                void fetchBalance();
              }}
            />
          </div>

          <div className="wallet-col-right">
            <MovementsTable
              movements={movements}
              total={totalMovements}
              loading={loadingMovements}
              onRefresh={() => {
                void fetchMovements();
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
