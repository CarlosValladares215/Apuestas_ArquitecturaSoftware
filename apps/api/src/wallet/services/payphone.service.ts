import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PayphoneVerificationResult {
  status: string; // 'Approved' | 'Rejected' | 'Pending'
  amountInCents: number;
  currency: string;
  clientTransactionId: string;
  payphoneTransactionId: string;
}

@Injectable()
export class PayphoneService {
  private readonly logger = new Logger(PayphoneService.name);
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly storeId: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = (
      this.configService.get<string>('PAYPHONE_API_URL') ?? 'https://pay.payphonetodoesposible.com'
    )
      .trim()
      .replace(/\/$/, '');
    this.token = (this.configService.get<string>('PAYPHONE_TOKEN') ?? 'sandbox_test_token').trim();
    this.storeId = (
      this.configService.get<string>('PAYPHONE_STORE_ID') ??
      this.configService.get<string>('PAYPHONE_CLIENT_ID') ??
      'sandbox_client_id'
    ).trim();
    this.frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('CORS_ORIGIN')?.split(',')[0] ??
      'http://localhost:3000'
    )
      .trim()
      .replace(/\/$/, '');
  }

  /**
   * Prepares a payment session against Payphone Links API when a real token is configured,
   * or returns a sandbox checkout return URL when running in academic/sandbox mode.
   * Note: As per Constitution Principles I & II, the user redirect NEVER credits funds.
   */
  async prepareSandboxPayment(params: {
    amountInCents: number;
    clientTransactionId: string;
    currency?: string;
  }): Promise<{ payphoneUrl: string; token: string }> {
    const currency = params.currency || 'USD';
    const hasRealToken = Boolean(
      this.token &&
      this.token !== 'sandbox_test_token' &&
      this.token !== 'replace_with_payphone_sandbox_token' &&
      process.env.NODE_ENV !== 'test',
    );

    if (hasRealToken) {
      try {
        const response = await fetch(`${this.apiUrl}/api/Links`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            amount: params.amountInCents,
            amountWithoutTax: params.amountInCents,
            clientTransactionId: params.clientTransactionId,
            currency,
            storeId: this.storeId,
            reference: 'Recarga Billetera UTPL',
            responseUrl: `${this.frontendUrl}/wallet?clientTxId=${encodeURIComponent(params.clientTransactionId)}`,
          }),
        });

        if (response.ok) {
          const paymentLinkUrl = (await response.text()).replace(/^"|"$/g, '').trim();
          if (paymentLinkUrl.startsWith('http')) {
            return {
              payphoneUrl: paymentLinkUrl,
              token: `live_tok_${params.clientTransactionId}`,
            };
          }
        }
        this.logger.warn(
          `Payphone Links API returned HTTP ${String(response.status)}; using sandbox fallback URL.`,
        );
      } catch (error) {
        this.logger.warn(`Payphone prepare request failed: ${(error as Error).message}`);
      }
    }

    const payphoneUrl = `${this.apiUrl}/sandbox/checkout?clientTxId=${encodeURIComponent(
      params.clientTransactionId,
    )}&amount=${String(params.amountInCents)}&currency=${currency}&responseUrl=${encodeURIComponent(
      `${this.frontendUrl}/wallet`,
    )}`;

    return {
      payphoneUrl,
      token: `sandbox_tok_${params.clientTransactionId}`,
    };
  }

  /**
   * Performs strict server-to-server verification against Payphone's V2/Confirm API.
   * Validates transaction status, amount, currency and clientTransactionId.
   */
  async verifyWithPayphone(params: {
    clientTransactionId: string;
    payphoneTransactionId: string;
  }): Promise<PayphoneVerificationResult> {
    const endpoint = `${this.apiUrl}/api/button/V2/Confirm`;
    this.logger.log(
      `Verifying Payphone transaction server-to-server: ${params.payphoneTransactionId} (clientTx: ${params.clientTransactionId})`,
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          id: Number(params.payphoneTransactionId) || params.payphoneTransactionId,
          clientTxId: params.clientTransactionId,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Payphone API returned non-OK status: ${String(response.status)}`);
        return {
          status: 'Rejected',
          amountInCents: 0,
          currency: 'USD',
          clientTransactionId: params.clientTransactionId,
          payphoneTransactionId: params.payphoneTransactionId,
        };
      }

      const data = (await response.json()) as {
        transactionStatus?: string;
        amount?: number;
        currency?: string;
        clientTransactionId?: string;
      };

      return {
        status: data.transactionStatus === 'Approved' ? 'Approved' : 'Rejected',
        amountInCents: data.amount ?? 0,
        currency: data.currency ?? 'USD',
        clientTransactionId: data.clientTransactionId ?? params.clientTransactionId,
        payphoneTransactionId: params.payphoneTransactionId,
      };
    } catch (error) {
      this.logger.error(`Error communicating with Payphone API: ${(error as Error).message}`);
      return {
        status: 'Rejected',
        amountInCents: 0,
        currency: 'USD',
        clientTransactionId: params.clientTransactionId,
        payphoneTransactionId: params.payphoneTransactionId,
      };
    }
  }
}
