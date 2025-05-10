import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { Role } from '../role';

export class SignInDto {
  @IsString()
  @MaxLength(64)
  username: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(4096)
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  /**
   * Twelve is the laboratory's own floor. It is not a guess: the accreditation
   * body asked for a number and this is the one that was written down.
   */
  @IsString()
  @MinLength(12)
  @MaxLength(200)
  newPassword: string;
}

export class CreateUserDto {
  @IsString()
  @MaxLength(64)
  username: string;

  @IsString()
  @MaxLength(120)
  displayName: string;

  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password: string;

  @IsArray()
  @IsEnum(Role, { each: true })
  roles: Role[];
}

export class UpdateRolesDto {
  @IsArray()
  @IsEnum(Role, { each: true })
  roles: Role[];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly tokenType: 'Bearer';
}

export interface AccountView {
  readonly id: number;
  readonly username: string;
  readonly displayName: string;
  readonly email: string;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly roles: readonly Role[];
  readonly lastLoginAt: string | null;
}
