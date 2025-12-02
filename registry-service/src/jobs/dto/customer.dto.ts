import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Booking a new customer onto the system. The code is typed by the desk rather
 * than allocated, because it is the code the customer already appears under in
 * the finance system and two different codes for the same firm is worse than
 * having to type one.
 */
export class CreateCustomerDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/, {
    message: 'a customer code is letters, digits and hyphens, 2 to 24 characters',
  })
  code: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsOptional()
  @IsBoolean()
  accreditedRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  turnaroundDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

/**
 * Everything about a customer except the code, which never changes. A customer
 * whose code was wrong is closed and booked in again, so the jobs already filed
 * against the old code keep pointing at something.
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsOptional()
  @IsBoolean()
  accreditedRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  turnaroundDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export interface CustomerView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly address: string | null;
  readonly accreditedRequired: boolean;
  readonly turnaroundDays: number;
  readonly active: boolean;
  readonly note: string | null;
  /** Something can be rung or emailed about a query on their work. */
  readonly reachable: boolean;
}

/** The customer row with the job counts the desk reads it beside. */
export interface CustomerSummary extends CustomerView {
  readonly openJobs: number;
  readonly lateJobs: number;
  readonly lastReceivedOn: string | null;
}
