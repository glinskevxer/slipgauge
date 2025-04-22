import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * A bench terminal recording that an instrument was used on a job. The work
 * order is optional because internal checks have none, but a use with no work
 * order and no customer is much harder to chase later, so the console warns.
 */
export class LogUsageDto {
  @IsString()
  @MaxLength(32)
  assetTag: string;

  @IsDateString()
  usedOn: string;

  @IsString()
  @MaxLength(120)
  usedBy: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  workOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  customer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  purpose?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  readingCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export interface UsageView {
  readonly id: number;
  readonly instrumentId: number;
  readonly assetTag: string;
  readonly usedOn: string;
  readonly usedBy: string;
  readonly workOrder: string | null;
  readonly customer: string | null;
  readonly purpose: string | null;
  readonly readingCount: number;
  readonly note: string | null;
  readonly summary: string;
}
