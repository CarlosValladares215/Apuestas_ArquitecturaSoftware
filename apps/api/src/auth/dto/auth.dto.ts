import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterDto {
  @Transform(({ value }) => trimString(value))
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsBoolean()
  isAdultConfirmed!: boolean;

  @IsString()
  @IsNotEmpty()
  captchaToken!: string;
}

export class VerifyEmailDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class LoginDto {
  @Transform(({ value }) => trimString(value))
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  captchaToken!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código TOTP debe tener 6 dígitos numéricos.' })
  totpCode?: string;
}

export class EnableTotpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código TOTP debe tener 6 dígitos numéricos.' })
  code!: string;
}
