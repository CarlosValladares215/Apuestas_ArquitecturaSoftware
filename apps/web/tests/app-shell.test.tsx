import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LoginPage from '../src/app/login/page';
import RegisterPage from '../src/app/registro/page';
import { AppShell } from '../src/components/AppShell';
import { SessionProvider } from '../src/context/session-context';

function createJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeUser(role: 'bettor' | 'operator' | 'admin', email: string) {
  return {
    id: `usr-${role}`,
    email,
    role,
    emailVerified: true,
    totpEnabled: false,
    adultConfirmedAt: '2026-11-15T12:00:00.000Z',
    createdAt: '2026-11-15T12:00:00.000Z',
  };
}

describe('AppShell, Role-Aware Sidebar & Session Topbar (Spec 014)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders visitor navigation, role guide, static footer, and hides internal operator/admin routes when unauthenticated', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(createJsonResponse(401, { message: 'Unauthorized' }));

    render(
      <SessionProvider>
        <AppShell currentPath="/">
          <main>
            <h1>Contenido de prueba</h1>
          </main>
        </AppShell>
      </SessionProvider>,
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent(/\+18/i);
    expect(footer).toHaveTextContent(/UTPL/i);

    const nav = screen.getByRole('navigation', { name: /navegación por rol/i });
    await waitFor(() => {
      expect(screen.getByText(/modo visitante/i)).toBeInTheDocument();
    });

    expect(within(nav).getByRole('link', { name: /cartelera/i })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: /ingresar/i })).toHaveAttribute('href', '/login');
    expect(within(nav).getByRole('link', { name: /crear cuenta/i })).toHaveAttribute(
      'href',
      '/registro',
    );
    expect(within(nav).getByRole('link', { name: /verificar correo/i })).toHaveAttribute(
      'href',
      '/verificar-correo',
    );
    expect(within(nav).queryByRole('link', { name: /panel de operador/i })).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: /usuarios y auditoría/i }),
    ).not.toBeInTheDocument();
    expect(nav).toHaveTextContent(/apostador/i);
    expect(nav).toHaveTextContent(/operador/i);
    expect(nav).toHaveTextContent(/administrador/i);
  });

  it('shows only bettor routes, visible Apostador role badge, and supports direct logout from topbar', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, { user: makeUser('bettor', 'cliente@utpl.edu.ec') }),
      )
      .mockResolvedValueOnce(createJsonResponse(200, { loggedOut: true }));
    global.fetch = fetchMock as typeof fetch;

    render(
      <SessionProvider>
        <AppShell currentPath="/wallet">
          <h1>Mi Billetera</h1>
        </AppShell>
      </SessionProvider>,
    );

    const header = screen.getByRole('banner');
    await waitFor(() => {
      expect(within(header).getByText('cliente@utpl.edu.ec')).toBeInTheDocument();
    });
    expect(within(header).getByText(/apostador/i)).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: /navegación por rol/i });
    expect(within(nav).getByRole('link', { name: /mi billetera/i })).toHaveAttribute(
      'href',
      '/wallet',
    );
    expect(within(nav).getByRole('link', { name: /seguridad 2fa/i })).toHaveAttribute(
      'href',
      '/seguridad',
    );
    expect(within(nav).queryByRole('link', { name: /panel de operador/i })).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: /usuarios y auditoría/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(header).getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(within(header).getByText(/modo visitante/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/auth\/logout$/),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('shows operator workspace link without admin panel for operator role', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        createJsonResponse(200, { user: makeUser('operator', 'operador@utpl.edu.ec') }),
      );

    render(
      <SessionProvider>
        <AppShell currentPath="/operador">
          <h1>Operador</h1>
        </AppShell>
      </SessionProvider>,
    );

    const header = screen.getByRole('banner');
    await waitFor(() => {
      expect(within(header).getByText('operador@utpl.edu.ec')).toBeInTheDocument();
    });
    expect(within(header).getByText(/^Rol: Operador$/i)).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: /navegación por rol/i });
    expect(within(nav).getByRole('link', { name: /panel de operador/i })).toHaveAttribute(
      'href',
      '/operador',
    );
    expect(
      within(nav).queryByRole('link', { name: /usuarios y auditoría/i }),
    ).not.toBeInTheDocument();
  });

  it('shows full operator + admin governance navigation for admin role and toggles mobile drawer state', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(createJsonResponse(200, { user: makeUser('admin', 'admin@utpl.edu.ec') }));

    render(
      <SessionProvider>
        <AppShell currentPath="/admin/usuarios">
          <h1>Admin</h1>
        </AppShell>
      </SessionProvider>,
    );

    const header = screen.getByRole('banner');
    await waitFor(() => {
      expect(within(header).getByText('admin@utpl.edu.ec')).toBeInTheDocument();
    });
    expect(within(header).getByText(/^Rol: Administrador$/i)).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: /navegación por rol/i });
    expect(within(nav).getByRole('link', { name: /panel de operador/i })).toHaveAttribute(
      'href',
      '/operador',
    );
    expect(within(nav).getByRole('link', { name: /usuarios y auditoría/i })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );

    const menuButton = within(header).getByRole('button', { name: /abrir menú de navegación/i });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('displays Apostador role clarity on /registro and immediately updates topbar/sidebar upon /login', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(createJsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(
        createJsonResponse(200, { user: makeUser('operator', 'nuevo.op@utpl.edu.ec') }),
      );

    const { unmount } = render(
      <SessionProvider>
        <RegisterPage />
      </SessionProvider>,
    );
    expect(screen.getByText(/cuenta nueva: apostador/i)).toBeInTheDocument();
    unmount();

    render(
      <SessionProvider>
        <LoginPage />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/modo visitante/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'nuevo.op@utpl.edu.ec' },
    });
    fireEvent.change(screen.getByLabelText(/^contraseña/i), {
      target: { value: 'SeguraPass2026' },
    });
    fireEvent.click(screen.getByLabelText(/verificación anti-bots/i));
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const header = screen.getByRole('banner');
    await waitFor(() => {
      expect(within(header).getByText('nuevo.op@utpl.edu.ec')).toBeInTheDocument();
    });
    expect(within(header).getByText(/^Rol: Operador$/i)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /navegación por rol/i });
    expect(within(nav).getByRole('link', { name: /panel de operador/i })).toBeInTheDocument();
  });
});
