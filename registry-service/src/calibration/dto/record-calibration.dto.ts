import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AcceptancePolicy } from '../conformity';

/** The coverage factor a bench reports when it does not state one. */
export const DEFAULT_COVERAGE_FACTOR = 2;

/**
 * One line of a calibration sheet as it arrives from the bench terminal.
 *
 * <p>Tolerance limits are absent on purpose. Letting the bench send them would
 * mean a typed limit could quietly override the profile the class is held to,
 * and the whole point of the profile is that the limits are not negotiable.
 */
export class MeasurementPointInput {
  @IsInt()
  @IsPositive()
  sequenceNo: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsNumber()
  nominal: number;

  @IsOptional()
  @IsNumber()
  asFound?: number;

  @IsOptional()
  @IsNumber()
  asLeft?: number;

  @IsNumber()
  @Min(0)
  expandedUncertainty: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  coverageFactor?: number;
}

export class RecordCalibrationDto {
  @IsString()
  @MaxLength(48)
  certificateNumber: string;

  @IsString()
  @MaxLength(32)
  assetTag: string;

  @IsDateString()
  performedOn: string;

  @IsDateString()
  issuedOn: string;

  @IsString()
  @MaxLength(120)
  performedBy: string;

  @IsString()
  @MaxLength(120)
  issuingLab: string;

  @IsOptional()
  @IsBoolean()
  externalLab?: boolean;

  @IsOptional()
  @IsBoolean()
  adjusted?: boolean;

  @IsOptional()
  @IsNumber()
  ambientTemperature?: number;

  @IsOptional()
  @IsNumber()
  ambientHumidity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @IsOptional()
  @IsEnum(AcceptancePolicy)
  acceptancePolicy?: AcceptancePolicy;

  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MeasurementPointInput)
  points: MeasurementPointInput[];
}

export function policyOf(request: RecordCalibrationDto): AcceptancePolicy {
  return request.acceptancePolicy ?? AcceptancePolicy.MANAGED_RISK;
}

export function coverageFactorOf(input: MeasurementPointInput): number {
  return input.coverageFactor ?? DEFAULT_COVERAGE_FACTOR;
}

/** The reading to judge as left with, which is as found when nothing moved. */
export function asLeftOf(input: MeasurementPointInput): number | null {
  return input.asLeft ?? input.asFound ?? null;
}
