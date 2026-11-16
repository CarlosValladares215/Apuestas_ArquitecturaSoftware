'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { WalletBalance, WalletMovementDto } from '@apuestas/shared';
import { SiteHeader } from '../../components/SiteHeader';
import { API_BASE_URL } from '../../lib/api-client';
import { BalanceCard } from './components/balance-card';
import { DepositForm } from './components/deposit-form';
import { MovementsTable } from './components/movements-table';

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [movements, setMovements] = useState<WalletMovementDto[]>([]);
  const [totalMovements, setTotalMovements] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState<boolean>(true);
  const [loadingMovements, setLoadingMovements] = useState<boolean>(true);
  const [authRequired, setAuthRequired] = useState<boolean>(false);

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/wallet/balance`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setAuthRequired(true);
        setBalance(null);
        return;
      }
      if (res.ok) {
        setAuthRequired(false);
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
      const res = await fetch(`${API_BASE_URL}/api/v1/wallet/movements?limit=20&offset=0`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setAuthRequired(true);
        setMovements([]);
        setTotalMovements(0);
        return;
      }
      if (res.ok) {
        setAuthRequired(false);
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
      <SiteHeader currentPath="/wallet" />

      <main className="main-container wallet-layout" id="main-content">
        <header className="wallet-header">
          <h1 className="hero-title">Billetera y Ledger Contable</h1>
          <p className="hero-copy">
            Gestión financiera con libro contable inmutable de doble entrada. Saldo derivado en el
            servidor sin mutaciones directas y depósitos verificados mediante Payphone Sandbox.
          </p>
        </header>

        {authRequired ? (
          <div role="alert" className="alert-error">
            <p>Debes iniciar sesión con tu cuenta verificada para consultar saldos y depositar.</p>
            <p>
              <Link href="/login">Ir a iniciar sesión</Link>
            </p>
          </div>
        ) : null}

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
