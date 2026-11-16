import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WalletPage from '../src/app/wallet/page';

describe('WalletPage (apps/web)', () => {
  beforeEach(() => {
    // Reset global fetch mock
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders semantic landmarks, accessible headings, and balance display from server', async () => {
    const mockBalance = {
      userId: 'usr_test_123',
      realBalance: 75.5,
      bonusBalance: 15.0,
      totalBalance: 90.5,
      currency: 'USD',
      updatedAt: new Date().toISOString(),
    };

    const mockMovements = {
      total: 1,
      movements: [
        {
          id: 'mov_1',
          transactionId: 'tx_1',
          referenceCode: 'DEP-20261115-01',
          type: 'DEPOSIT',
          accountType: 'user_real',
          entryType: 'CREDIT',
          amount: 75.5,
          description: 'Depósito verificado Payphone Sandbox',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/balance')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBalance),
        });
      }
      if (url.includes('/movements')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMovements),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<WalletPage />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /billetera y ledger/i }),
    ).toBeInTheDocument();

    // Verify balance cards loaded from server
    await waitFor(() => {
      expect(screen.getAllByText(/\$75\.50/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
      expect(screen.getByText(/\$90\.50/)).toBeInTheDocument();
    });

    // Verify movements table renders server movements
    expect(screen.getByText(/DEP-20261115-01/)).toBeInTheDocument();
    expect(screen.getByText(/Depósito verificado Payphone Sandbox/)).toBeInTheDocument();
  });

  it('allows initiating a deposit intent with Payphone Sandbox without crediting balance client-side', async () => {
    const mockBalance = {
      userId: 'usr_test_123',
      realBalance: 0.0,
      bonusBalance: 0.0,
      totalBalance: 0.0,
      currency: 'USD',
      updatedAt: new Date().toISOString(),
    };

    (global.fetch as jest.Mock).mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/balance')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBalance),
        });
      }
      if (url.includes('/movements')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ total: 0, movements: [] }),
        });
      }
      if (url.includes('/deposits/intent') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              intentId: 'intent_123',
              clientTransactionId: 'DEP-SANDBOX-TEST-99',
              amount: 25.0,
              currency: 'USD',
              status: 'PENDING',
              payphoneUrl:
                'https://pay.payphonetodoesposible.com/sandbox/checkout?clientTxId=DEP-SANDBOX-TEST-99',
            }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<WalletPage />);

    // Check accessible form elements
    const amountInput = screen.getByLabelText(/monto a recargar/i);
    const submitButton = screen.getByRole('button', { name: /iniciar depósito/i });

    expect(amountInput).toBeInTheDocument();
    expect(submitButton).toBeInTheDocument();

    // Fill form and submit
    fireEvent.change(amountInput, { target: { value: '25.00' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/DEP-SANDBOX-TEST-99/)).toBeInTheDocument();
      expect(screen.getByText(/intención de pago generada/i)).toBeInTheDocument();
    });

    // CRITICAL INVARIANT: The page must inform that credit happens strictly server-to-server
    expect(
      screen.getByText(
        /la acreditación solo ocurre tras la confirmación verificada servidor a servidor/i,
      ),
    ).toBeInTheDocument();

    const firstCall = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(firstCall[1].credentials).toBe('include');
  });

  it('prompts for authentication when the server returns 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });

    render(<WalletPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/debes iniciar sesión/i);
  });
});
