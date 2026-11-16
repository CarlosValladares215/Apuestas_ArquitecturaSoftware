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
import { WalletService } from './services/wallet.service';
import { CreateDepositIntentDto } from './dto/create-deposit-intent.dto';
import { ConfirmDepositDto } from './dto/confirm-deposit.dto';
import { DebitWalletDto } from './dto/debit-wallet.dto';

@Controller(['api/v1/wallet', 'wallet'])
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  async getBalance(@Headers('x-user-id') userIdHeader?: string): Promise<WalletBalance> {
    const userId = userIdHeader || 'usr_bettor_123';
    return this.walletService.getBalance(userId);
  }

  @Get('movements')
  async getMovements(
    @Headers('x-user-id') userIdHeader?: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ): Promise<{ movements: WalletMovementDto[]; total: number }> {
    const userId = userIdHeader || 'usr_bettor_123';
    return this.walletService.getMovements(userId, limit, offset);
  }

  @Post('deposits/intent')
  @HttpCode(HttpStatus.CREATED)
  async createDepositIntent(
    @Body() dto: CreateDepositIntentDto,
    @Headers('x-user-id') userIdHeader?: string,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Ip() ipAddress?: string,
  ): Promise<DepositIntentResponseDto> {
    const userId = userIdHeader || 'usr_bettor_123';
    return this.walletService.createDepositIntent({
      userId,
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
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Ip() ipAddress?: string,
  ): Promise<ConfirmDepositResponseDto> {
    return this.walletService.confirmDeposit({
      clientTransactionId: dto.clientTransactionId,
      payphoneTransactionId: dto.payphoneTransactionId,
      idempotencyKey: idempotencyKeyHeader,
      ipAddress,
    });
  }

  @Post('debit')
  @HttpCode(HttpStatus.OK)
  async debit(
    @Body() dto: DebitWalletDto,
    @Headers('x-user-id') userIdHeader?: string,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Ip() ipAddress?: string,
  ): Promise<DebitWalletResponseDto> {
    const userId = userIdHeader || 'usr_bettor_123';
    return this.walletService.debit({
      userId,
      amountInCents: dollarsToCents(dto.amount),
      referenceCode: dto.referenceCode,
      description: dto.description,
      accountType: dto.accountType,
      idempotencyKey: idempotencyKeyHeader || `DEBIT_${dto.referenceCode}`,
      ipAddress,
    });
  }
}
