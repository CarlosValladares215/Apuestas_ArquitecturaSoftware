import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import HomePage from '../src/app/page';

describe('HomePage', () => {
  it('renders semantic main landmark, heading, and service readiness board', () => {
    render(<HomePage />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /plataforma de apuestas deportivas/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/aplicación web/i)).toBeInTheDocument();
    expect(screen.getByText(/api principal/i)).toBeInTheDocument();
    expect(screen.getByText(/servicio de reportes/i)).toBeInTheDocument();
  });

  it('does not expose secret keys or perform client-side balance calculations', () => {
    const { container } = render(<HomePage />);
    const text = container.textContent;

    expect(text).not.toMatch(/API_FOOTBALL_KEY|PAYPHONE_TOKEN/i);
    expect(screen.getByText(/en modo de solo presentación/i)).toBeInTheDocument();
  });
});
