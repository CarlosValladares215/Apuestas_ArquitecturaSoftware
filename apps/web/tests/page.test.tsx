import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import HomePage from '../src/app/page';

describe('HomePage & Matchboard (005-partidos-mercados & 006-sincronizacion-api-football)', () => {
  it('renders semantic landmarks, matchboard heading, and API-Football budget monitor', () => {
    render(<HomePage />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /cartelera deportiva y mercados en tiempo real/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/presupuesto diario api-football/i)).toBeInTheDocument();
    expect(screen.getByText(/frecuencia adaptativa/i)).toBeInTheDocument();
  });

  it('displays matches with competition, status badges, and locks pre-match markets after server kickoff', () => {
    render(<HomePage />);

    expect(screen.getByText(/LDU Quito vs Independiente del Valle/i)).toBeInTheDocument();
    expect(screen.getByText(/Ecuador vs Argentina/i)).toBeInTheDocument();
    expect(screen.getByText(/FC Barcelona vs Bayern München/i)).toBeInTheDocument();

    // Default selected match is the live match LDU Quito vs Independiente del Valle:
    // Its pre-match 1X2 market must be closed by server clock while its live market is open
    const detailPanel = screen.getByRole('region', { name: /detalle de mercados del partido/i });
    expect(
      within(detailPanel).getByText(/mercado cerrado — partido iniciado/i),
    ).toBeInTheDocument();

    const closedHomeButton = within(detailPanel).getByRole('button', {
      name: /Resultado Final \(1X2\) — LDU Quito cuota 2\.15 \(Mercado cerrado\)/i,
    });
    expect(closedHomeButton).toBeDisabled();

    const openLiveButton = within(detailPanel).getByRole('button', {
      name: /Próximo Gol \(En Vivo\) — LDU Quito cuota 1\.95/i,
    });
    expect(openLiveButton).not.toBeDisabled();
  });

  it('filters matches by status and switches active match in the market detail view', () => {
    render(<HomePage />);

    const scheduledFilter = screen.getByRole('button', { name: /filtrar por programados/i });
    fireEvent.click(scheduledFilter);
    expect(scheduledFilter).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByText(/Ecuador vs Argentina/i)).toBeInTheDocument();
    expect(screen.queryByText(/FC Barcelona vs Bayern München/i)).not.toBeInTheDocument();

    const inspectScheduledMatchBtn = screen.getByRole('button', {
      name: /ver mercados de Ecuador vs Argentina/i,
    });
    fireEvent.click(inspectScheduledMatchBtn);

    const detailPanel = screen.getByRole('region', { name: /detalle de mercados del partido/i });
    expect(
      within(detailPanel).getByText(/Total de Goles \(Más\/Menos 2\.5\)/i),
    ).toBeInTheDocument();

    const overSelectionBtn = within(detailPanel).getByRole('button', {
      name: /Total de Goles \(Más\/Menos 2\.5\) — Más de 2\.5 goles cuota 2\.10/i,
    });
    expect(overSelectionBtn).not.toBeDisabled();
  });

  it('does not expose secret keys or call API-Football directly from the client', () => {
    const { container } = render(<HomePage />);
    const text = container.textContent;

    expect(text).not.toMatch(/API_FOOTBALL_KEY|PAYPHONE_TOKEN|sandbox_secret/i);
    expect(screen.getByText(/solo presentación/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /billetera y depósitos/i })).toHaveAttribute(
      'href',
      '/wallet',
    );
    expect(
      screen.getByRole('heading', { name: /arquitectura de tres servicios/i }),
    ).toBeInTheDocument();
  });
});
