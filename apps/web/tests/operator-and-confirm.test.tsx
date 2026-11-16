import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiFootballSyncStatus, MatchWithMarkets } from '@apuestas/shared';
import OperatorPage from '../src/app/operador/page';
import RegisterPage from '../src/app/registro/page';
import { DepositForm } from '../src/app/wallet/components/deposit-form';
import { Matchboard } from '../src/components/matchboard';

function createJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const SAMPLE_SYNC: ApiFootballSyncStatus = {
  dateUtc: '2026-11-15',
  dailyBudget: 10,
  liveReserve: 2,
  usedToday: 1,
  remainingToday: 9,
  activeLiveMatches: 1,
  mode: 'live_active',
  recommendedIntervalMs: 60000,
  apiKeyConfigured: false,
  lastSyncAt: '2026-11-15T18:00:00.000Z',
  lastSyncOutcome: 'updated',
};

const SAMPLE_MATCH: MatchWithMarkets = {
  id: 'match_op_1',
  competitionId: 'comp_ligapro',
  competition: {
    id: 'comp_ligapro',
    name: 'LigaPro Serie A',
    country: 'Ecuador',
    sport: 'football',
  },
  homeTeam: 'Emelec',
  awayTeam: 'Aucas',
  kickoffAt: '2026-11-16T20:00:00.000Z',
  status: 'programado',
  score: { home: 0, away: 0 },
  elapsedMinute: null,
  updatedAt: '2026-11-15T18:00:00.000Z',
  markets: [
    {
      id: 'mkt_op_1x2',
      matchId: 'match_op_1',
      type: 'match_winner_1x2',
      name: 'Resultado Final (1X2)',
      isPreMatch: true,
      status: 'open',
      closedReason: null,
      selections: [
        { id: 's1', marketId: 'mkt_op_1x2', key: 'HOME', label: 'Emelec', odds: 2.1 },
        { id: 's2', marketId: 'mkt_op_1x2', key: 'DRAW', label: 'Empate', odds: 3.1 },
        { id: 's3', marketId: 'mkt_op_1x2', key: 'AWAY', label: 'Aucas', odds: 3.4 },
      ],
    },
  ],
};

describe('Bloque A Live Integration Flows (Operador, Payphone S2S, Sandbox Register & Live Matchboard)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.history.replaceState({}, '', '/');
  });

  it('/operador rejects bettor sessions with RBAC warning and performs operator actions with credentials include', async () => {
    const deniedFetch = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          user: {
            id: 'u-bettor',
            email: 'bettor@utpl.edu.ec',
            role: 'bettor',
            emailVerified: true,
            totpEnabled: false,
            adultConfirmedAt: '2026-11-15T12:00:00.000Z',
            createdAt: '2026-11-15T12:00:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(200, [SAMPLE_MATCH]))
      .mockResolvedValueOnce(createJsonResponse(200, SAMPLE_SYNC));
    global.fetch = deniedFetch as typeof fetch;

    const { unmount } = render(<OperatorPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/requiere rol operator o admin/i);
    unmount();

    const operatorFetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/me')) {
        return Promise.resolve(
          createJsonResponse(200, {
            user: {
              id: 'u-op',
              email: 'operador@utpl.edu.ec',
              role: 'operator',
              emailVerified: true,
              totpEnabled: false,
              adultConfirmedAt: '2026-11-15T12:00:00.000Z',
              createdAt: '2026-11-15T12:00:00.000Z',
            },
          }),
        );
      }
      if (url.endsWith('/matches') && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(createJsonResponse(200, [SAMPLE_MATCH]));
      }
      if (url.endsWith('/matches/sync/status')) {
        return Promise.resolve(createJsonResponse(200, SAMPLE_SYNC));
      }
      if (url.endsWith('/matches/sync/run')) {
        return Promise.resolve(
          createJsonResponse(200, { ...SAMPLE_SYNC, usedToday: 2, remainingToday: 8 }),
        );
      }
      if (url.endsWith('/matches/match_op_1/status')) {
        return Promise.resolve(
          createJsonResponse(200, {
            ...SAMPLE_MATCH,
            status: 'en_vivo',
            elapsedMinute: 1,
          }),
        );
      }
      if (url.endsWith('/matches') && init?.method === 'POST') {
        return Promise.resolve(
          createJsonResponse(201, {
            ...SAMPLE_MATCH,
            id: 'match_created_2',
            homeTeam: 'El Nacional',
            awayTeam: 'Macará',
          }),
        );
      }
      return Promise.resolve(createJsonResponse(404, { message: 'Not mocked' }));
    });
    global.fetch = operatorFetch as typeof fetch;

    render(<OperatorPage />);
    expect(await screen.findByText(/Emelec vs Aucas/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ejecutar Sync Live/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Cuota usada hoy: 2\/10/i);

    fireEvent.click(screen.getByRole('button', { name: /Pasar a en_vivo/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Estado actualizado.*en_vivo/i);

    fireEvent.change(screen.getByLabelText(/Equipo local/i), { target: { value: 'El Nacional' } });
    fireEvent.change(screen.getByLabelText(/Equipo visitante/i), { target: { value: 'Macará' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear partido/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/El Nacional vs Macará/i);

    for (const call of operatorFetch.mock.calls) {
      const init = call[1];
      expect(init?.credentials).toBe('include');
    }
  }, 15000);

  it('DepositForm pre-fills Payphone return query parameters and submits S2S confirmation', async () => {
    window.history.replaceState({}, '', '/wallet?clientTransactionId=DEP_RET_123&id=PAY_998877');
    const onRefreshBalance = jest.fn();
    const fetchMock = jest.fn().mockResolvedValueOnce(
      createJsonResponse(200, {
        success: true,
        status: 'approved',
        clientTransactionId: 'DEP_RET_123',
        creditedAmount: 25,
        currency: 'USD',
        newRealBalance: 25,
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    render(<DepositForm onRefreshBalance={onRefreshBalance} />);

    const clientTxInput = screen.getByLabelText(/Referencia de intención/i);
    const payphoneTxInput = screen.getByLabelText(/ID de transacción Payphone/i);
    expect(clientTxInput).toHaveValue('DEP_RET_123');
    expect(payphoneTxInput).toHaveValue('PAY_998877');

    fireEvent.click(screen.getByRole('button', { name: /Confirmar acreditación S2S/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/wallet\/deposits\/confirm$/);
    expect(init.credentials).toBe('include');
    expect(await screen.findByRole('status')).toHaveTextContent(/Nuevo saldo real: \$25\.00 USD/i);
    expect(onRefreshBalance).toHaveBeenCalledTimes(1);
  });

  it('/registro renders sandbox verification link when backend returns sandboxVerificationUrl', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      createJsonResponse(201, {
        user: {
          id: 'u-99',
          email: 'demo@utpl.edu.ec',
          role: 'bettor',
          emailVerified: false,
          totpEnabled: false,
          adultConfirmedAt: '2026-11-15T12:00:00.000Z',
          createdAt: '2026-11-15T12:00:00.000Z',
        },
        verificationRequired: true,
        message: 'Cuenta creada en modo sandbox.',
        sandboxVerificationUrl: 'http://localhost:3000/verificar-correo?token=tok_demo_123',
      }),
    ) as typeof fetch;

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'demo@utpl.edu.ec' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'SeguraPass2026' },
    });
    fireEvent.click(screen.getByLabelText(/mayor de 18 años/i));
    fireEvent.click(screen.getByLabelText(/verificación anti-bots/i));
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    const directLink = await screen.findByRole('link', {
      name: /Abrir enlace directo de verificación/i,
    });
    expect(directLink).toHaveAttribute('href', '/verificar-correo?token=tok_demo_123');
  });

  it('Matchboard upgrades from SSR props to live API fixtures when backend responds', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.endsWith('/matches')) {
        return Promise.resolve(createJsonResponse(200, [SAMPLE_MATCH]));
      }
      if (url.endsWith('/matches/sync/status')) {
        return Promise.resolve(createJsonResponse(200, { ...SAMPLE_SYNC, remainingToday: 7 }));
      }
      return Promise.resolve(createJsonResponse(404, {}));
    }) as typeof fetch;

    render(<Matchboard initialMatches={[]} syncStatus={SAMPLE_SYNC} />);

    expect(await screen.findByText(/Emelec vs Aucas/i)).toBeInTheDocument();
    expect(screen.getByText('API en vivo')).toBeInTheDocument();
    expect(screen.getByText(/7 \/ 10 disponibles/i)).toBeInTheDocument();
  });
});
