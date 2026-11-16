import { MATCH_STATUSES, MatchStatus, SyncQuotaPurpose } from '@apuestas/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateMatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  competitionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  competitionName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  country!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  homeTeam!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  awayTeam!: string;

  @IsISO8601()
  kickoffAt!: string;
}

export class UpdateMatchStatusDto {
  @IsString()
  @IsIn(MATCH_STATUSES)
  status!: MatchStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  homeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  elapsedMinute?: number;
}

export class MarketSelectionInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;

  @IsNumber()
  @Min(1.01)
  odds!: number;
}

export class CreateMarketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  isPreMatch!: boolean;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => MarketSelectionInputDto)
  selections!: MarketSelectionInputDto[];
}

export class OddsSelectionUpdateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key!: string;

  @IsNumber()
  @Min(1.01)
  odds!: number;
}

export class UpdateMarketOddsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OddsSelectionUpdateDto)
  selections!: OddsSelectionUpdateDto[];
}

export class RunSyncDto {
  @IsOptional()
  @IsString()
  @IsIn(['live', 'scheduled'])
  purpose?: SyncQuotaPurpose;
}
