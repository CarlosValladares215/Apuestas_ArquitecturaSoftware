'use client';

import Link from 'next/link';
import { SyntheticEvent, useCallback, useEffect, useState } from 'react';
import {
  ApiFootballSyncStatus,
  AuthUserView,
  MATCH_STATE_TRANSITIONS,
  MatchStatus,
  MatchWithMarkets,
  SyncQuotaPurpose,
} from '@apuestas/shared';
import { SiteHeader } from '../../components/SiteHeader';
import {
  ApiClientError,
  createMatch,
  fetchCurrentUser,
  fetchMatches,
  fetchMatchSyncStatus,
  runMatchSync,
  updateMarketOdds,
  updateMatchStatus,
} from '../../lib/api-client';

function defaultKickoffLocalValue(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setSeconds(0, 0);
  return tomorrow.toISOString().slice(0, 16);
}

export default function OperatorPage() {
  const [sessionUser, setSessionUser] = useState<AuthUserView | null>(null);
  const [matches, setMatches] = useState<MatchWithMarkets[]>([]);
  const [syncStatus, setSyncStatus] = useState<ApiFootballSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create match form state
  const [competitionId, setCompetitionId] = useState('comp_ligapro');
  const [competitionName, setCompetitionName] = useState('LigaPro Serie A');
  const [country, setCountry] = useState('Ecuador');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [kickoffLocal, setKickoffLocal] = useState(defaultKickoffLocalValue);

  // Local odds edit drafts keyed by `${marketId}:${selectionKey}`
  const [oddsDrafts, setOddsDrafts] = useState<Record<string, string>>({});

  const loadOperatorConsole = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [me, liveMatches, quota] = await Promise.all([
        fetchCurrentUser(),
        fetchMatches(),
        fetchMatchSyncStatus(),
      ]);
      setSessionUser(me.user);
      setMatches(liveMatches);
      setSyncStatus(quota);

      if (me.user.role !== 'operator' && me.user.role !== 'admin') {
        setErrorMessage(
          `Tu cuenta (${me.user.email}) tiene rol "${me.user.role}". Este panel requiere rol operator o admin.`,
        );
      }
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        setSessionUser(null);
        setErrorMessage(
          'Acceso denegado por el servidor: inicia sesión con una cuenta operator o admin para gestionar eventos y cuotas.',
        );
      } else {
        setErrorMessage('No fue posible conectar con el servidor de partidos y sincronización.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOperatorConsole();
  }, [loadOperatorConsole]);

  const isAuthorized = sessionUser?.role === 'operator' || sessionUser?.role === 'admin';

  async function handleRunSync(purpose: SyncQuotaPurpose): Promise<void> {
    setErrorMessage(null);
    setStatusMessage(null);
    setSubmitting(true);
    try {
      const nextStatus = await runMatchSync(purpose);
      const updatedMatches = await fetchMatches();
      setSyncStatus(nextStatus);
      setMatches(updatedMatches);
      setStatusMessage(
        `Ciclo "${purpose}" ejecutado (${nextStatus.lastSyncOutcome}). Cuota usada hoy: ${String(nextStatus.usedToday)}/${String(nextStatus.dailyBudget)}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError ? error.message : 'Error al ejecutar sincronización.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateMatch(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!homeTeam.trim() || !awayTeam.trim()) {
      setErrorMessage('Ingresa los nombres del equipo local y visitante.');
      return;
    }

    const parsedKickoff = new Date(kickoffLocal);
    if (Number.isNaN(parsedKickoff.getTime())) {
      setErrorMessage('La fecha y hora de inicio no tiene un formato válido.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createMatch({
        competitionId: competitionId.trim(),
        competitionName: competitionName.trim(),
        country: country.trim(),
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        kickoffAt: parsedKickoff.toISOString(),
      });
      setMatches((prev) => [created, ...prev]);
      setHomeTeam('');
      setAwayTeam('');
      setStatusMessage(
        `Partido creado en el servidor: ${created.homeTeam} vs ${created.awayTeam} (mercado 1X2 abierto).`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError ? error.message : 'No fue posible crear el partido.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransitionStatus(
    match: MatchWithMarkets,
    nextStatus: MatchStatus,
  ): Promise<void> {
    setErrorMessage(null);
    setStatusMessage(null);
    setSubmitting(true);
    try {
      const updated = await updateMatchStatus(match.id, {
        status: nextStatus,
        homeScore: match.score.home,
        awayScore: match.score.away,
        ...(nextStatus === 'en_vivo' ? { elapsedMinute: match.elapsedMinute ?? 1 } : {}),
      });
      setMatches((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setStatusMessage(
        `Estado actualizado para ${updated.homeTeam} vs ${updated.awayTeam}: ${updated.status}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError
          ? error.message
          : 'No se pudo cambiar el estado del partido.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveOdds(matchId: string, marketId: string): Promise<void> {
    setErrorMessage(null);
    setStatusMessage(null);

    const targetMatch = matches.find((item) => item.id === matchId);
    const targetMarket = targetMatch?.markets.find((mkt) => mkt.id === marketId);
    if (!targetMarket) {
      return;
    }

    const updatedSelections: Array<{ key: string; odds: number }> = [];
    for (const sel of targetMarket.selections) {
      const draftKey = `${marketId}:${sel.key}`;
      const rawValue = oddsDrafts[draftKey] ?? String(sel.odds);
      const numericOdds = Number(rawValue);
      if (!Number.isFinite(numericOdds) || numericOdds < 1.01) {
        setErrorMessage(`Cuota inválida para ${sel.label}. Debe ser mayor o igual a 1.01.`);
        return;
      }
      updatedSelections.push({ key: sel.key, odds: numericOdds });
    }

    setSubmitting(true);
    try {
      const updatedMarket = await updateMarketOdds(matchId, marketId, updatedSelections);
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId
            ? {
                ...m,
                markets: m.markets.map((mkt) => (mkt.id === marketId ? updatedMarket : mkt)),
              }
            : m,
        ),
      );
      setStatusMessage(`Cuotas guardadas para mercado "${updatedMarket.name}".`);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError
          ? error.message
          : 'No se pudieron actualizar las cuotas del mercado.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell">
      <SiteHeader currentPath="/operador" />

      <main className="admin-layout">
        <section className="panel-card" aria-labelledby="operator-heading">
          <h1 id="operator-heading" className="hero-title">
            Panel de Operador y Cuotas
          </h1>
          <p className="hero-copy">
            Gestión de eventos deportivos, transición validada de estados, actualización manual de
            cuotas y control de cuota diaria de API-Football protegida por RBAC (`operator` /
            `admin`).
          </p>

          {loading ? <p>Verificando sesión y consultando cartelera en servidor...</p> : null}

          {errorMessage ? (
            <div role="alert" className="alert-error">
              <p>{errorMessage}</p>
              <p>
                <Link href="/login">Ir a iniciar sesión</Link>
              </p>
            </div>
          ) : null}

          {statusMessage ? (
            <p role="status" className="alert-success">
              {statusMessage}
            </p>
          ) : null}
        </section>

        {isAuthorized && syncStatus ? (
          <section className="panel-card" aria-labelledby="sync-heading">
            <h2 id="sync-heading" className="board-heading">
              Sincronización API-Football
            </h2>
            <p className="board-subtitle">
              Cuota diaria UTC ({syncStatus.dateUtc}): {String(syncStatus.usedToday)}/
              {String(syncStatus.dailyBudget)} peticiones · Reserva en vivo:{' '}
              {String(syncStatus.liveReserve)} · Origen:{' '}
              {syncStatus.apiKeyConfigured
                ? 'API-Football v3 configurado'
                : 'Simulación/Fallback local'}
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn-primary"
                disabled={submitting}
                onClick={() => {
                  void handleRunSync('live');
                }}
              >
                Ejecutar Sync Live
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={submitting}
                onClick={() => {
                  void handleRunSync('scheduled');
                }}
              >
                Ejecutar Sync Programados
              </button>
            </div>
          </section>
        ) : null}

        {isAuthorized ? (
          <section className="panel-card" aria-labelledby="create-match-heading">
            <h2 id="create-match-heading" className="board-heading">
              Crear Nuevo Partido
            </h2>
            <form
              className="stack-form"
              onSubmit={(event) => {
                void handleCreateMatch(event);
              }}
              noValidate
            >
              <div className="field-group">
                <label htmlFor="op-comp-id" className="field-label">
                  ID de competición
                </label>
                <input
                  id="op-comp-id"
                  type="text"
                  className="field-input"
                  value={competitionId}
                  onChange={(event) => {
                    setCompetitionId(event.target.value);
                  }}
                />
              </div>

              <div className="field-group">
                <label htmlFor="op-comp-name" className="field-label">
                  Nombre de competición
                </label>
                <input
                  id="op-comp-name"
                  type="text"
                  className="field-input"
                  value={competitionName}
                  onChange={(event) => {
                    setCompetitionName(event.target.value);
                  }}
                />
              </div>

              <div className="field-group">
                <label htmlFor="op-country" className="field-label">
                  País
                </label>
                <input
                  id="op-country"
                  type="text"
                  className="field-input"
                  value={country}
                  onChange={(event) => {
                    setCountry(event.target.value);
                  }}
                />
              </div>

              <div className="field-group">
                <label htmlFor="op-home" className="field-label">
                  Equipo local
                </label>
                <input
                  id="op-home"
                  type="text"
                  className="field-input"
                  value={homeTeam}
                  onChange={(event) => {
                    setHomeTeam(event.target.value);
                  }}
                  placeholder="Ej. Emelec"
                />
              </div>

              <div className="field-group">
                <label htmlFor="op-away" className="field-label">
                  Equipo visitante
                </label>
                <input
                  id="op-away"
                  type="text"
                  className="field-input"
                  value={awayTeam}
                  onChange={(event) => {
                    setAwayTeam(event.target.value);
                  }}
                  placeholder="Ej. Aucas"
                />
              </div>

              <div className="field-group">
                <label htmlFor="op-kickoff" className="field-label">
                  Fecha y hora de inicio (UTC/local)
                </label>
                <input
                  id="op-kickoff"
                  type="datetime-local"
                  className="field-input"
                  value={kickoffLocal}
                  onChange={(event) => {
                    setKickoffLocal(event.target.value);
                  }}
                />
              </div>

              <div className="btn-row">
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Guardando...' : 'Crear partido'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {isAuthorized && matches.length > 0 ? (
          <section className="panel-card" aria-labelledby="manage-matches-heading">
            <h2 id="manage-matches-heading" className="board-heading">
              Partidos Activos y Cuotas ({String(matches.length)})
            </h2>
            <ul className="matches-list">
              {matches.map((match) => {
                const allowedNext = MATCH_STATE_TRANSITIONS[match.status];
                return (
                  <li key={match.id} className="match-card">
                    <div className="match-meta-row">
                      <span className="competition-label">
                        {match.competition.name} ({match.competition.country})
                      </span>
                      <span className="status-badge">
                        {match.status} · {String(match.score.home)} - {String(match.score.away)}
                      </span>
                    </div>

                    <p className="match-title">
                      {match.homeTeam} vs {match.awayTeam}
                    </p>

                    {allowedNext.length > 0 ? (
                      <div className="btn-row" aria-label={`Transiciones de ${match.homeTeam}`}>
                        {allowedNext.map((nextStatus) => (
                          <button
                            key={nextStatus}
                            type="button"
                            className="btn-secondary"
                            disabled={submitting}
                            onClick={() => {
                              void handleTransitionStatus(match, nextStatus);
                            }}
                          >
                            Pasar a {nextStatus}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="field-hint">Estado terminal ({match.status}).</p>
                    )}

                    <div className="markets-grid">
                      {match.markets.map((market) => (
                        <div key={market.id} className="market-box">
                          <div className="market-header">
                            <span className="market-name">{market.name}</span>
                            <span className="market-state">{market.status}</span>
                          </div>
                          <div className="selections-row">
                            {market.selections.map((sel) => {
                              const draftKey = `${market.id}:${sel.key}`;
                              return (
                                <label key={sel.id} className="field-group">
                                  <span className="field-hint">{sel.label}</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="1.01"
                                    className="field-input"
                                    aria-label={`Cuota ${sel.label} (${market.name})`}
                                    value={oddsDrafts[draftKey] ?? String(sel.odds)}
                                    onChange={(event) => {
                                      const val = event.target.value;
                                      setOddsDrafts((prev) => ({
                                        ...prev,
                                        [draftKey]: val,
                                      }));
                                    }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                          {market.status === 'open' ? (
                            <div className="btn-row">
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={submitting}
                                onClick={() => {
                                  void handleSaveOdds(match.id, market.id);
                                }}
                              >
                                Guardar cuotas
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
