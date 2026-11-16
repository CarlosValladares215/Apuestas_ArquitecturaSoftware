import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateDepositIntentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @IsIn(['USD'])
  currency = 'USD' as const;
}
