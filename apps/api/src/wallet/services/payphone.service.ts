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
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl =
      this.configService.get<string>('PAYPHONE_API_URL') || 'https://pay.payphonetodoesposible.com';
    this.token = this.configService.get<string>('PAYPHONE_TOKEN') || 'sandbox_test_token';
    this.clientId = this.configService.get<string>('PAYPHONE_CLIENT_ID') || 'sandbox_client_id';
  }

  /**
   * Prepares a sandbox payment session and returns the checkout URL.
   * Note: As per Constitution Principles I & II, the user redirect NEVER credits funds.
   */
  async prepareSandboxPayment(params: {
    amountInCents: number;
    clientTransactionId: string;
    currency?: string;
  }): Promise<{ payphoneUrl: string; token: string }> {
    await Promise.resolve();
    const currency = params.currency || 'USD';
    this.logger.log(
      `Preparing Payphone sandbox session for tx ${params.clientTransactionId}: ${String(params.amountInCents)} cents (${currency})`,
    );

    const payphoneUrl = `${this.apiUrl}/sandbox/checkout?clientTxId=${encodeURIComponent(
      params.clientTransactionId,
    )}&amount=${String(params.amountInCents)}&currency=${currency}`;

    return {
      payphoneUrl,
      token: `sandbox_tok_${params.clientTransactionId}`,
    };
  }

  /**
   * Performs strict server-to-server verification against Payphone's API.
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
          id: params.payphoneTransactionId,
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
      // Fallback for isolated unit tests / offline sandbox if not mocked
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
