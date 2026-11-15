import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminUsersPage from '../src/app/admin/usuarios/page';
import LoginPage from '../src/app/login/page';
import RegisterPage from '../src/app/registro/page';
import SecurityPage from '../src/app/seguridad/page';
import VerifyEmailPage from '../src/app/verificar-correo/page';

interface MockFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function createJsonResponse(status: number, body: unknown): MockFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('Auth & Security pages (Spec 002)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('/registro enforces adult confirmation client guard and posts with credentials include without touching localStorage', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(201, {
        user: {
          id: 'u-1',
          email: 'bettor@utpl.edu.ec',
          role: 'bettor',
          emailVerified: false,
          totpEnabled: false,
          adultConfirmedAt: '2026-11-15T12:00:00.000Z',
          createdAt: '2026-11-15T12:00:00.000Z',
        },
        verificationRequired: true,
        message: 'Cuenta creada. Revisa tu correo para verificar tu dirección.',
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    render(<RegisterPage />);

    const emailInput = screen.getByLabelText(/correo electrónico/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const adultCheckbox = screen.getByLabelText(/mayor de 18 años/i);
    const captchaCheckbox = screen.getByLabelText(/verificación anti-bots/i);
    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });

    fireEvent.change(emailInput, { target: { value: 'bettor@utpl.edu.ec' } });
    fireEvent.change(passwordInput, { target: { value: 'SeguraPass2026' } });
    fireEvent.click(captchaCheckbox);

    // Submitting without adult confirmation shows accessible error and skips fetch
    fireEvent.click(submitButton);
    expect(await screen.findByRole('alert')).toHaveTextContent(/18 años/i);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(adultCheckbox);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callArgs[0]).toMatch(/\/auth\/register$/);
    expect(callArgs[1].credentials).toBe('include');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(await screen.findByText(/cuenta creada/i)).toBeInTheDocument();
  });

  it('/login authenticates via httpOnly cookies with credentials include and surfaces actionable errors', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          code: 'TOTP_REQUIRED',
          message: 'Ingresa el código TOTP de 6 dígitos de tu autenticador.',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          user: {
            id: 'u-1',
            email: 'bettor@utpl.edu.ec',
            role: 'bettor',
            emailVerified: true,
            totpEnabled: true,
            adultConfirmedAt: '2026-11-15T12:00:00.000Z',
            createdAt: '2026-11-15T12:00:00.000Z',
          },
        }),
      );
    global.fetch = fetchMock as typeof fetch;

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'bettor@utpl.edu.ec' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'SeguraPass2026' },
    });
    fireEvent.click(screen.getByLabelText(/verificación anti-bots/i));
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/totp/i);

    fireEvent.change(screen.getByLabelText(/código 2fa totp/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByText(/sesión activa/i)).toBeInTheDocument();
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstCall[1].credentials).toBe('include');
    expect(window.localStorage.length).toBe(0);
  });

  it('/verificar-correo verifies email verification token with credentials include', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse(200, {
        verified: true,
        user: {
          id: 'u-1',
          email: 'bettor@utpl.edu.ec',
          role: 'bettor',
          emailVerified: true,
          totpEnabled: false,
          adultConfirmedAt: '2026-11-15T12:00:00.000Z',
          createdAt: '2026-11-15T12:00:00.000Z',
        },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    render(<VerifyEmailPage />);
    fireEvent.change(screen.getByLabelText(/token de verificación/i), {
      target: { value: 'tok-valid-12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar correo/i }));

    expect(await screen.findByText(/correo verificado correctamente/i)).toBeInTheDocument();
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callArgs[0]).toMatch(/\/auth\/verify-email$/);
    expect(callArgs[1].credentials).toBe('include');
  });

  it('/seguridad loads session profile and drives 2FA setup & enable', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          user: {
            id: 'u-1',
            email: 'bettor@utpl.edu.ec',
            role: 'bettor',
            emailVerified: true,
            totpEnabled: false,
            adultConfirmedAt: '2026-11-15T12:00:00.000Z',
            createdAt: '2026-11-15T12:00:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/ApuestasDeportivasUTPL:bettor@utpl.edu.ec?secret=JBSWY3DPEHPK3PXP',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          enabled: true,
          user: {
            id: 'u-1',
            email: 'bettor@utpl.edu.ec',
            role: 'bettor',
            emailVerified: true,
            totpEnabled: true,
            adultConfirmedAt: '2026-11-15T12:00:00.000Z',
            createdAt: '2026-11-15T12:00:00.000Z',
          },
        }),
      );
    global.fetch = fetchMock as typeof fetch;

    render(<SecurityPage />);
    expect(await screen.findByText(/bettor@utpl\.edu\.ec/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /generar secreto 2fa/i }));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/código de verificación de 6 dígitos/i), {
      target: { value: '654321' },
    });
    fireEvent.click(screen.getByRole('button', { name: /activar 2fa/i }));

    expect(await screen.findByText(/2fa totp activado/i)).toBeInTheDocument();
  });

  it('/admin/usuarios enforces server authorization error and renders users + audit logs for admins', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          items: [
            {
              id: 'u-2',
              email: 'apuesta@utpl.edu.ec',
              role: 'bettor',
              emailVerified: true,
              totpEnabled: false,
              adultConfirmedAt: '2026-11-15T12:00:00.000Z',
              createdAt: '2026-11-15T12:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          items: [
            {
              id: 'aud-1',
              actorUserId: 'u-admin',
              action: 'USER_ROLE_CHANGED',
              targetType: 'User',
              targetId: 'u-2',
              ipAddress: '127.0.0.1',
              userAgent: 'Chrome',
              deviceFingerprint: null,
              metadata: { nextRole: 'operator' },
              createdAt: '2026-11-15T12:05:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      );
    global.fetch = fetchMock as typeof fetch;

    render(<AdminUsersPage />);
    expect(await screen.findByText('apuesta@utpl.edu.ec')).toBeInTheDocument();
    expect(await screen.findByText('USER_ROLE_CHANGED')).toBeInTheDocument();
  });

  it('/admin/usuarios displays server access denial on 403/401', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(403, { message: 'Forbidden resource' }))
      .mockResolvedValueOnce(createJsonResponse(403, { message: 'Forbidden resource' }));
    global.fetch = fetchMock as typeof fetch;

    render(<AdminUsersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/acceso denegado por el servidor/i);
  });
});
