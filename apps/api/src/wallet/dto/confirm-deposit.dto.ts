import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmDepositDto {
  @IsString()
  @IsNotEmpty()
  clientTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  payphoneTransactionId!: string;
}
