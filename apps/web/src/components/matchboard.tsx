'use client';

import {
  ApiFootballSyncStatus,
  BettingMarket,
  MatchStatus,
  MatchWithMarkets,
} from '@apuestas/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchMatches, fetchMatchSyncStatus } from '../lib/api-client';

type StatusFilter = 'all' | MatchStatus;

interface FilterOption {
  value: StatusFilter;
  label: string;
  ariaLabel: string;
}

const STATUS_FILTERS: readonly FilterOption[] = [
  { value: 'all', label: 'Todos', ariaLabel: 'Filtrar por todos los estados' },
  { value: 'en_vivo', label: 'En vivo', ariaLabel: 'Filtrar por en vivo' },
  { value: 'programado', label: 'Programados', ariaLabel: 'Filtrar por programados' },
  { value: 'suspendido', label: 'Suspendidos', ariaLabel: 'Filtrar por suspendidos' },
  { value: 'finalizado', label: 'Finalizados', ariaLabel: 'Filtrar por finalizados' },
];

const STATUS_LABELS: Readonly<Record<MatchStatus, string>> = {
  programado: 'Programado',
  en_vivo: 'En vivo',
  finalizado: 'Finalizado',
  suspendido: 'Suspendido',
  aplazado: 'Aplazado',
  cancelado: 'Cancelado',
};

function formatClosedReason(market: BettingMarket): string {
  if (market.closedReason === 'match_started') {
    return 'Mercado cerrado — Partido iniciado (reloj del servidor)';
  }
  if (market.closedReason === 'match_status_changed') {
    return 'Mercado cerrado — Estado del partido no admite apuestas';
  }
  return 'Mercado cerrado por el operador';
}

export interface MatchboardProps {
  initialMatches: readonly MatchWithMarkets[];
  syncStatus: ApiFootballSyncStatus;
}

export function Matchboard({ initialMatches, syncStatus }: Readonly<MatchboardProps>) {
  const [matches, setMatches] = useState<readonly MatchWithMarkets[]>(initialMatches);
  const [liveSyncStatus, setLiveSyncStatus] = useState<ApiFootballSyncStatus>(syncStatus);
  const [dataSource, setDataSource] = useState<'fallback' | 'live'>('fallback');
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedMatchId, setSelectedMatchId] = useState<string>(initialMatches[0]?.id ?? '');
  const [selectedOutcomeNotice, setSelectedOutcomeNotice] = useState<string | null>(null);

  const refreshFromServer = useCallback(async (isMounted?: () => boolean) => {
    setRefreshing(true);
    try {
      const [remoteMatches, remoteSync] = await Promise.all([
        fetchMatches(),
        fetchMatchSyncStatus(),
      ]);
      if (isMounted && !isMounted()) {
        return;
      }
      if (remoteMatches.length > 0) {
        setMatches(remoteMatches);
      }
      setLiveSyncStatus(remoteSync);
      setDataSource('live');
    } catch {
      // Keeps SSR / fallback fixtures cleanly rendered when API is unreachable
    } finally {
      if (!isMounted || isMounted()) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof globalThis.fetch !== 'function') {
      return;
    }
    let mounted = true;
    void refreshFromServer(() => mounted);
    return () => {
      mounted = false;
    };
  }, [refreshFromServer]);

  const filteredMatches =
    statusFilter === 'all' ? matches : matches.filter((match) => match.status === statusFilter);

  const activeMatch =
    filteredMatches.find((match) => match.id === selectedMatchId) ??
    filteredMatches[0] ??
    matches[0];

  const intervalSeconds =
    liveSyncStatus.recommendedIntervalMs !== null
      ? Math.round(liveSyncStatus.recommendedIntervalMs / 1000)
      : null;

  return (
    <div className="matchboard-wrapper">
      <section className="sync-banner" aria-label="Estado de sincronización API-Football">
        <div className="sync-banner-metric">
          <span className="sync-label">Presupuesto diario API-Football</span>
          <strong className="sync-value">
            {liveSyncStatus.remainingToday} / {liveSyncStatus.dailyBudget} disponibles (reserva en
            vivo: {liveSyncStatus.liveReserve})
          </strong>
        </div>
        <div className="sync-banner-metric">
          <span className="sync-label">Frecuencia adaptativa</span>
          <strong className="sync-value">
            {intervalSeconds !== null
              ? `Cada ${String(intervalSeconds)} s (${String(liveSyncStatus.activeLiveMatches)} en vivo)`
              : 'Pausada por límite diario'}
          </strong>
        </div>
        <div className="sync-banner-metric">
          <span className="sync-label">Origen de datos</span>
          <strong className="sync-value">
            {dataSource === 'live' ? 'API en vivo' : 'Cartelera inicial'}
          </strong>
        </div>
      </section>

      <div className="filter-bar" role="toolbar" aria-label="Filtros de estado del partido">
        {STATUS_FILTERS.map((option) => {
          const isActive = statusFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={isActive ? 'filter-chip filter-chip-active' : 'filter-chip'}
              aria-label={option.ariaLabel}
              aria-pressed={isActive}
              onClick={() => {
                setStatusFilter(option.value);
              }}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          className="filter-chip"
          disabled={refreshing}
          onClick={() => {
            void refreshFromServer();
          }}
        >
          {refreshing ? 'Actualizando...' : 'Actualizar cartelera'}
        </button>
      </div>

      <div className="matchboard-grid">
        <section aria-label="Lista de partidos disponibles" className="fixtures-column">
          {filteredMatches.length === 0 ? (
            <p className="empty-state">
              No hay partidos en este estado actualmente. Selecciona otro filtro para ver la
              cartelera completa.
            </p>
          ) : (
            <ul className="fixture-list">
              {filteredMatches.map((match) => {
                const isSelected = activeMatch?.id === match.id;
                const primaryMarket = match.markets[0];

                return (
                  <li
                    key={match.id}
                    className={isSelected ? 'fixture-card fixture-card-selected' : 'fixture-card'}
                  >
                    <div className="fixture-card-header">
                      <span className="competition-tag">
                        {match.competition.name} · {match.competition.country}
                      </span>
                      <span className={`status-pill status-${match.status}`}>
                        {STATUS_LABELS[match.status]}
                        {match.status === 'en_vivo' && match.elapsedMinute !== null
                          ? ` · ${String(match.elapsedMinute)}'`
                          : ''}
                      </span>
                    </div>

                    <div className="fixture-teams-row">
                      <div className="fixture-matchup">
                        <h2 className="fixture-title">
                          {match.homeTeam} vs {match.awayTeam}
                        </h2>
                        <span className="kickoff-time">
                          Inicio UTC: {match.kickoffAt.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                      <div className="score-box" aria-label="Marcador actual">
                        <span>{match.score.home}</span>
                        <span className="score-divider">:</span>
                        <span>{match.score.away}</span>
                      </div>
                    </div>

                    {primaryMarket ? (
                      <div className="primary-market-strip">
                        <span className="market-strip-label">
                          {primaryMarket.name} —{' '}
                          {primaryMarket.status === 'open'
                            ? 'Abierto'
                            : 'Cerrado por reloj del servidor'}
                        </span>
                        <div className="odds-row">
                          {primaryMarket.selections.map((sel) => (
                            <span key={sel.id} className="odds-preview-chip">
                              <span className="odds-preview-label">{sel.label}</span>
                              <strong className="odds-preview-value">{sel.odds.toFixed(2)}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="fixture-actions">
                      <button
                        type="button"
                        className="inspect-button"
                        aria-label={`Ver mercados de ${match.homeTeam} vs ${match.awayTeam}`}
                        onClick={() => {
                          setSelectedMatchId(match.id);
                        }}
                      >
                        Ver mercados ({match.markets.length})
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside
          className="market-detail-panel"
          role="region"
          aria-label="Detalle de mercados del partido"
        >
          {activeMatch ? (
            <>
              <div className="detail-header">
                <span className="competition-tag">{activeMatch.competition.name}</span>
                <h2 className="detail-title">
                  Mercados: {activeMatch.homeTeam} — {activeMatch.awayTeam}
                </h2>
                <p className="detail-meta">
                  Estado: <strong>{STATUS_LABELS[activeMatch.status]}</strong> · Marcador:{' '}
                  <strong>
                    {activeMatch.score.home} - {activeMatch.score.away}
                  </strong>
                </p>
              </div>

              {selectedOutcomeNotice ? (
                <div className="selection-notice" role="status">
                  {selectedOutcomeNotice}
                </div>
              ) : null}

              <div className="markets-stack">
                {activeMatch.markets.map((market) => {
                  const isClosed = market.status !== 'open';
                  return (
                    <div key={market.id} className="market-box">
                      <div className="market-box-header">
                        <h3 className="market-box-title">{market.name}</h3>
                        <span className={isClosed ? 'market-badge-closed' : 'market-badge-open'}>
                          {isClosed
                            ? formatClosedReason(market)
                            : market.isPreMatch
                              ? 'Pre-partido abierto'
                              : 'En vivo abierto'}
                        </span>
                      </div>

                      <div className="selection-grid">
                        {market.selections.map((sel) => {
                          const formattedOdds = sel.odds.toFixed(2);
                          const accessibleLabel = `${market.name} — ${sel.label} cuota ${formattedOdds}${
                            isClosed ? ' (Mercado cerrado)' : ''
                          }`;

                          return (
                            <button
                              key={sel.id}
                              type="button"
                              disabled={isClosed}
                              aria-label={accessibleLabel}
                              className={
                                isClosed
                                  ? 'selection-button selection-button-disabled'
                                  : 'selection-button'
                              }
                              onClick={() => {
                                setSelectedOutcomeNotice(
                                  `Selección previsualizada: ${sel.label} (cuota ${formattedOdds}). La validación y congelación de cuota ocurre en el servidor al confirmar boleto.`,
                                );
                              }}
                            >
                              <span className="selection-name">{sel.label}</span>
                              <strong className="selection-odds">{formattedOdds}</strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
