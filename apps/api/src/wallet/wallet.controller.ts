import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
} from '@nestjs/common';
import {
  ConfirmDepositResponseDto,
  DebitWalletResponseDto,
  DepositIntentResponseDto,
  dollarsToCents,
  WalletBalance,
  WalletMovementDto,
} from '@apuestas/shared';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { WalletService } from './services/wallet.service';
import { CreateDepositIntentDto } from './dto/create-deposit-intent.dto';
import { ConfirmDepositDto } from './dto/confirm-deposit.dto';
import { DebitWalletDto } from './dto/debit-wallet.dto';

@Controller(['api/v1/wallet', 'wallet'])
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: AuthenticatedUser): Promise<WalletBalance> {
    return this.walletService.getBalance(user.userId);
  }

  @Get('movements')
  async getMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ): Promise<{ movements: WalletMovementDto[]; total: number }> {
    const parsedLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const parsedOffset = Math.max(0, Math.floor(Number(offset) || 0));
    return this.walletService.getMovements(user.userId, parsedLimit, parsedOffset);
  }

  @Post('deposits/intent')
  @HttpCode(HttpStatus.CREATED)
  async createDepositIntent(
    @Body() dto: CreateDepositIntentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Ip() ipAddress?: string,
  ): Promise<DepositIntentResponseDto> {
    return this.walletService.createDepositIntent({
      userId: user.userId,
      amountInDollars: dto.amount,
      currency: dto.currency,
      idempotencyKey: idempotencyKeyHeader,
      ipAddress,
    });
  }

  @Post('deposits/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmDeposit(
    @Body() dto: ConfirmDepositDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Ip() ipAddress?: string,
  ): Promise<ConfirmDepositResponseDto> {
    return this.walletService.confirmDeposit({
      clientTransactionId: dto.clientTransactionId,
      payphoneTransactionId: dto.payphoneTransactionId,
      actorUserId: user.userId,
      actorRole: user.role,
      idempotencyKey: idempotencyKeyHeader,
      ipAddress,
    });
  }

  @Post('debit')
  @HttpCode(HttpStatus.OK)
  async debit(
    @Body() dto: DebitWalletDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Ip() ipAddress?: string,
  ): Promise<DebitWalletResponseDto> {
    return this.walletService.debit({
      userId: user.userId,
      amountInCents: dollarsToCents(dto.amount),
      referenceCode: dto.referenceCode,
      description: dto.description,
      accountType: dto.accountType,
      idempotencyKey: idempotencyKeyHeader || `DEBIT_${dto.referenceCode}`,
      ipAddress,
    });
  }
}
