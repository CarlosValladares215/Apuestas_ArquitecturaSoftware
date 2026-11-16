import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AppRole,
  centsToDollars,
  ConfirmDepositResponseDto,
  DebitWalletResponseDto,
  DepositIntentResponseDto,
  dollarsToCents,
  WalletBalance,
  WalletMovementDto,
} from '@apuestas/shared';
import { AuditService } from '../../audit/audit.service';
import { LedgerService } from './ledger.service';
import { PayphoneService } from './payphone.service';
import { IWalletRepository, WALLET_REPOSITORY } from '../repositories/wallet.repository.interface';
import {
  IPaymentIntentRepository,
  PAYMENT_INTENT_REPOSITORY,
} from '../repositories/payment-intent.repository.interface';
import {
  AUDIT_LOG_REPOSITORY,
  IAuditLogRepository,
} from '../repositories/audit-log.repository.interface';
import { InsufficientFundsException } from '../exceptions/insufficient-funds.exception';
import { PaymentTamperedException } from '../exceptions/payment-tampered.exception';
import { ILedgerRepository, LEDGER_REPOSITORY } from '../repositories/ledger.repository.interface';

@Injectable()
export class WalletService {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly payphoneService: PayphoneService,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: IWalletRepository,
    @Inject(PAYMENT_INTENT_REPOSITORY)
    private readonly paymentIntentRepository: IPaymentIntentRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: IAuditLogRepository,
    @Inject(LEDGER_REPOSITORY)
    private readonly ledgerRepository: ILedgerRepository,
    @Optional()
    private readonly globalAuditService?: AuditService,
  ) {}

  /**
   * Derives wallet balance from ledger entries.
   * Real and bonus accounts are maintained strictly separate.
   */
  async getBalance(userId: string): Promise<WalletBalance> {
    await this.walletRepository.getOrCreateWallet(userId);
    const realAccount = await this.ledgerService.getUserRealAccount(userId);
    const bonusAccount = await this.ledgerService.getUserBonusAccount(userId);

    const realCents = await this.ledgerService.getAccountBalanceInCents(realAccount.id);
    const bonusCents = await this.ledgerService.getAccountBalanceInCents(bonusAccount.id);

    const realBalance = centsToDollars(realCents);
    const bonusBalance = centsToDollars(bonusCents);
    const totalBalance = centsToDollars(realCents + bonusCents);

    return {
      userId,
      realBalance,
      bonusBalance,
      totalBalance,
      currency: 'USD',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Creates a deposit intent. Does NOT credit any balance.
   */
  async createDepositIntent(params: {
    userId: string;
    amountInDollars: number;
    currency?: 'USD';
    idempotencyKey?: string;
    ipAddress?: string;
  }): Promise<DepositIntentResponseDto> {
    await this.walletRepository.getOrCreateWallet(params.userId);

    const amountInCents = dollarsToCents(params.amountInDollars);
    const clientTransactionId = `DEP-${String(Date.now())}-${randomUUID().slice(0, 8)}`;

    const intent = await this.paymentIntentRepository.createIntent({
      userId: params.userId,
      clientTransactionId,
      amount: amountInCents,
      currency: 'USD',
      status: 'PENDING',
    });

    const paymentSession = await this.payphoneService.prepareSandboxPayment({
      amountInCents,
      clientTransactionId,
      currency: 'USD',
    });

    await this.recordWalletAudit({
      userId: params.userId,
      action: 'DEPOSIT_INTENT_CREATED',
      resource: 'payment_intents',
      targetId: intent.id,
      details: {
        intentId: intent.id,
        clientTransactionId,
        amountInCents,
        currency: 'USD',
        idempotencyKey: params.idempotencyKey,
      },
      ipAddress: params.ipAddress,
    });

    return {
      intentId: intent.id,
      clientTransactionId,
      amount: params.amountInDollars,
      currency: 'USD',
      status: 'PENDING',
      payphoneUrl: paymentSession.payphoneUrl,
    };
  }

  /**
   * Confirms a deposit server-to-server with Payphone Sandbox.
   * Serialized with row-level locking mutex on the user's wallet.
   */
  async confirmDeposit(params: {
    clientTransactionId: string;
    payphoneTransactionId: string;
    actorUserId?: string;
    actorRole?: AppRole;
    idempotencyKey?: string;
    ipAddress?: string;
  }): Promise<ConfirmDepositResponseDto> {
    const initialIntent = await this.paymentIntentRepository.findByClientTxId(
      params.clientTransactionId,
    );

    if (!initialIntent) {
      throw new NotFoundException(
        `Intención de pago '${params.clientTransactionId}' no encontrada`,
      );
    }

    if (
      params.actorUserId &&
      initialIntent.userId !== params.actorUserId &&
      params.actorRole !== 'admin'
    ) {
      throw new ForbiddenException(
        'No tienes permisos para confirmar una intención de depósito de otro usuario.',
      );
    }

    return this.walletRepository.withLock(initialIntent.userId, async () => {
      const intent = await this.paymentIntentRepository.findByClientTxId(
        params.clientTransactionId,
      );

      if (!intent) {
        throw new NotFoundException(
          `Intención de pago '${params.clientTransactionId}' no encontrada`,
        );
      }

      const userRealAccount = await this.ledgerService.getUserRealAccount(intent.userId);

      // Idempotency check: if intent is already COMPLETED, return current state without re-crediting
      if (intent.status === 'COMPLETED') {
        const currentBalanceCents = await this.ledgerService.getAccountBalanceInCents(
          userRealAccount.id,
        );
        return {
          success: true,
          status: 'COMPLETED',
          clientTransactionId: intent.clientTransactionId,
          creditedAmount: centsToDollars(intent.amount),
          currency: 'USD',
          newRealBalance: centsToDollars(currentBalanceCents),
        };
      }

      // Verify transaction server-to-server with Payphone Sandbox
      const verification = await this.payphoneService.verifyWithPayphone({
        clientTransactionId: params.clientTransactionId,
        payphoneTransactionId: params.payphoneTransactionId,
      });

      // Strict tampering detection (Constitution Principle I & II)
      const isApproved = verification.status === 'Approved';
      const amountMatches = verification.amountInCents === intent.amount;
      const currencyMatches = verification.currency === 'USD';
      const clientTxMatches = verification.clientTransactionId === intent.clientTransactionId;

      if (!isApproved || !amountMatches || !currencyMatches || !clientTxMatches) {
        await this.paymentIntentRepository.updateStatus(
          intent.clientTransactionId,
          'REJECTED',
          params.payphoneTransactionId,
        );

        await this.recordWalletAudit({
          userId: intent.userId,
          action: 'PAYMENT_TAMPERED_REJECTED',
          resource: 'payment_intents',
          targetId: intent.id,
          details: {
            clientTransactionId: intent.clientTransactionId,
            expectedAmount: intent.amount,
            receivedAmount: verification.amountInCents,
            expectedCurrency: 'USD',
            receivedCurrency: verification.currency,
            payphoneStatus: verification.status,
            payphoneTransactionId: params.payphoneTransactionId,
          },
          ipAddress: params.ipAddress,
        });

        throw new PaymentTamperedException();
      }

      // Valid: Atomic double-entry credit in ledger
      const gatewayAccount = await this.ledgerService.getGatewayAccount('payphone');
      const idempotencyKey = params.idempotencyKey || `DEP_CONFIRM_${params.payphoneTransactionId}`;

      await this.ledgerService.recordDoubleEntryTransaction({
        referenceCode: intent.clientTransactionId,
        type: 'DEPOSIT',
        description: 'Depósito verificado Payphone Sandbox',
        idempotencyKey,
        entries: [
          {
            accountId: gatewayAccount.id,
            entryType: 'DEBIT',
            amount: intent.amount,
          },
          {
            accountId: userRealAccount.id,
            entryType: 'CREDIT',
            amount: intent.amount,
          },
        ],
      });

      await this.paymentIntentRepository.updateStatus(
        intent.clientTransactionId,
        'COMPLETED',
        params.payphoneTransactionId,
      );

      await this.recordWalletAudit({
        userId: intent.userId,
        action: 'DEPOSIT_CONFIRMED',
        resource: 'wallets',
        targetId: intent.clientTransactionId,
        details: {
          clientTransactionId: intent.clientTransactionId,
          amountInCents: intent.amount,
          payphoneTransactionId: params.payphoneTransactionId,
          idempotencyKey,
        },
        ipAddress: params.ipAddress,
      });

      const newBalanceCents = await this.ledgerService.getAccountBalanceInCents(userRealAccount.id);

      return {
        success: true,
        status: 'COMPLETED',
        clientTransactionId: intent.clientTransactionId,
        creditedAmount: centsToDollars(intent.amount),
        currency: 'USD',
        newRealBalance: centsToDollars(newBalanceCents),
      };
    });
  }

  /**
   * Internal / seeding helper to credit deposits directly under row lock.
   */
  async creditDeposit(params: {
    userId: string;
    amountInCents: number;
    clientTransactionId: string;
    payphoneTransactionId: string;
    idempotencyKey: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.walletRepository.withLock(params.userId, async () => {
      const userReal = await this.ledgerService.getUserRealAccount(params.userId);
      const gateway = await this.ledgerService.getGatewayAccount('payphone');

      await this.ledgerService.recordDoubleEntryTransaction({
        referenceCode: params.clientTransactionId,
        type: 'DEPOSIT',
        description: 'Depósito acreditado',
        idempotencyKey: params.idempotencyKey,
        entries: [
          {
            accountId: gateway.id,
            entryType: 'DEBIT',
            amount: params.amountInCents,
          },
          {
            accountId: userReal.id,
            entryType: 'CREDIT',
            amount: params.amountInCents,
          },
        ],
      });

      await this.recordWalletAudit({
        userId: params.userId,
        action: 'DIRECT_DEPOSIT_CREDITED',
        resource: 'wallets',
        targetId: params.clientTransactionId,
        details: {
          clientTransactionId: params.clientTransactionId,
          amountInCents: params.amountInCents,
          idempotencyKey: params.idempotencyKey,
        },
        ipAddress: params.ipAddress,
      });
    });
  }

  /**
   * Atomic debit with row locking and balance validation against the ledger.
   * Completely prevents double-spending and overdrawing.
   */
  async debit(params: {
    userId: string;
    amountInCents: number;
    referenceCode: string;
    description: string;
    idempotencyKey: string;
    accountType?: 'user_real' | 'user_bonus';
    ipAddress?: string;
  }): Promise<DebitWalletResponseDto> {
    return this.walletRepository.withLock(params.userId, async () => {
      const accountType = params.accountType ?? 'user_real';
      const targetAccount =
        accountType === 'user_bonus'
          ? await this.ledgerService.getUserBonusAccount(params.userId)
          : await this.ledgerService.getUserRealAccount(params.userId);

      // Check idempotency first: if already processed, return stored state
      const existingTx = await this.ledgerRepository.findTransactionByIdempotencyKey(
        params.idempotencyKey,
      );
      if (existingTx) {
        const currentBalanceCents = await this.ledgerService.getAccountBalanceInCents(
          targetAccount.id,
        );
        return {
          success: true,
          transactionId: existingTx.id,
          debitedAmount: centsToDollars(params.amountInCents),
          remainingBalance: centsToDollars(currentBalanceCents),
        };
      }

      // Derive balance directly from ledger entries
      const currentBalanceCents = await this.ledgerService.getAccountBalanceInCents(
        targetAccount.id,
      );

      if (currentBalanceCents < params.amountInCents) {
        await this.recordWalletAudit({
          userId: params.userId,
          action: 'DEBIT_REJECTED_INSUFFICIENT_FUNDS',
          resource: 'wallets',
          targetId: params.referenceCode,
          details: {
            requiredCents: params.amountInCents,
            availableCents: currentBalanceCents,
            referenceCode: params.referenceCode,
          },
          ipAddress: params.ipAddress,
        });

        throw new InsufficientFundsException();
      }

      const houseAccount = await this.ledgerService.getHouseAccount('main');

      const txResult = await this.ledgerService.recordDoubleEntryTransaction({
        referenceCode: params.referenceCode,
        type: 'BET_STAKE',
        description: params.description,
        idempotencyKey: params.idempotencyKey,
        entries: [
          {
            accountId: targetAccount.id,
            entryType: 'DEBIT',
            amount: params.amountInCents,
          },
          {
            accountId: houseAccount.id,
            entryType: 'CREDIT',
            amount: params.amountInCents,
          },
        ],
      });

      const remainingBalanceCents = currentBalanceCents - params.amountInCents;

      await this.recordWalletAudit({
        userId: params.userId,
        action: 'WALLET_DEBITED',
        resource: 'wallets',
        targetId: txResult.transaction.id,
        details: {
          transactionId: txResult.transaction.id,
          debitedCents: params.amountInCents,
          remainingCents: remainingBalanceCents,
          referenceCode: params.referenceCode,
          idempotencyKey: params.idempotencyKey,
        },
        ipAddress: params.ipAddress,
      });

      return {
        success: true,
        transactionId: txResult.transaction.id,
        debitedAmount: centsToDollars(params.amountInCents),
        remainingBalance: centsToDollars(remainingBalanceCents),
      };
    });
  }

  async getMovements(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ movements: WalletMovementDto[]; total: number }> {
    return this.ledgerService.getMovementsByUser(userId, limit, offset);
  }

  private async recordWalletAudit(input: {
    userId: string;
    action: string;
    resource: string;
    targetId?: string | null;
    details: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    await this.auditLogRepository.record({
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      details: input.details,
      ipAddress: input.ipAddress,
    });

    if (this.globalAuditService) {
      await this.globalAuditService.record({
        actorUserId: input.userId,
        action: input.action,
        targetType: input.resource,
        targetId: input.targetId ?? input.userId,
        ipAddress: input.ipAddress ?? null,
        metadata: input.details,
      });
    }
  }
}
