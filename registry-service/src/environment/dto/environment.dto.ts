import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { Discipline } from '../../instrument/instrument.enums';
import { ExcursionKind, ExcursionSeverity } from '../excursion';

/** Setting or replacing the band a room is held to. */
export class SetEnvironmentLimitDto {
  @IsString()
  @MaxLength(24)
  locationCode: string;

  @IsOptional()
  @IsEnum(Discipline)
  discipline?: Discipline;

  @IsNumber()
  @Min(-80)
  @Max(200)
  temperatureMin: number;

  @IsNumber()
  @Min(-80)
  @Max(200)
  temperatureMax: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humidityMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humidityMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  driftPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  soakHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  methodReference?: string;
}

/** One sample. */
export class ReadingDto {
  @IsDateString()
  takenAt: string;

  @IsNumber()
  @Min(-80)
  @Max(200)
  temperature: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humidity?: number;
}

/**
 * A logger upload. Sent in batches because that is how a logger is read: it is
 * unplugged, walked to a desk and emptied, and one request per sample would be
 * four thousand requests for a week in one room.
 */
export class UploadReadingsDto {
  @IsString()
  @MaxLength(24)
  locationCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  loggerRef?: string;

  @IsOptional()
  @IsString()
  source?: 'LOGGER' | 'MANUAL';

  @ValidateNested({ each: true })
  @Type(() => ReadingDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  readings: ReadingDto[];
}

export class AssessExcursionDto {
  @IsString()
  @MaxLength(400)
  finding: string;
}

export interface EnvironmentLimitView {
  readonly id: number;
  readonly locationCode: string;
  readonly locationName: string;
  readonly discipline: Discipline | null;
  readonly temperatureMin: number;
  readonly temperatureMax: number;
  readonly humidityMin: number | null;
  readonly humidityMax: number | null;
  readonly driftPerHour: number | null;
  readonly soakHours: number;
  readonly methodReference: string | null;
  readonly summary: string;
}

export interface ExcursionView {
  readonly id: number;
  readonly locationCode: string;
  readonly locationName: string;
  readonly kind: ExcursionKind;
  readonly severity: ExcursionSeverity;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly worstValue: number;
  readonly limitValue: number;
  readonly overshoot: number;
  readonly readings: number;
  readonly open: boolean;
  readonly assessed: boolean;
  readonly assessedBy: string | null;
  readonly finding: string | null;
  /** True when work done in the room while it lasted has to be looked at. */
  readonly putsWorkInQuestion: boolean;
}

/** What a room was doing, for the chart. */
export interface RoomTrace {
  readonly locationCode: string;
  readonly limit: EnvironmentLimitView | null;
  readonly samples: readonly {
    readonly takenAt: string;
    readonly temperature: number;
    readonly humidity: number | null;
    readonly outside: boolean;
  }[];
}

/** What an upload found, which is what the desk is told. */
export interface UploadResult {
  readonly accepted: number;
  readonly duplicates: number;
  readonly excursionsOpened: number;
  readonly excursionsClosed: number;
}

/** A certificate that was issued while the room was outside its band. */
export interface AffectedCertificate {
  readonly certificateId: number;
  readonly certificateNumber: string;
  readonly assetTag: string;
  readonly performedOn: string;
  readonly performedBy: string;
  readonly withdrawn: boolean;
  /** True when the room was out for the whole of the day it was measured. */
  readonly wholeDay: boolean;
}

export interface AffectedWork {
  readonly excursionId: number;
  readonly locationCode: string;
  readonly severity: string;
  readonly from: string;
  readonly to: string;
  readonly certificates: readonly AffectedCertificate[];
}

export class WithdrawAffectedDto {
  @IsString()
  @MaxLength(400)
  reason: string;
}
