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

import { StandardRole } from '../../traceability/standard-role';
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

  /**
   * The room it was measured in. Left out, the register takes the room the
   * instrument lives in, which is right for the laboratory's own kit and is the
   * only thing anybody could have meant.
   */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  performedInLocationCode?: string;

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

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StandardInput)
  standards?: StandardInput[];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  traceabilityOverrideReason?: string;
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

/**
 * A standard as the bench records it. Either an asset tag this register knows
 * or an outside reference, never both, which the service checks rather than
 * the validator because the message needs to name the offending entry.
 */
export class StandardInput {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  assetTag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalLab?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  externalCertificateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalAccreditation?: string;

  @IsOptional()
  @IsDateString()
  externalValidFrom?: string;

  @IsOptional()
  @IsDateString()
  externalValidTo?: string;

  @IsEnum(StandardRole)
  role: StandardRole;
}

export function namesInternal(input: StandardInput): boolean {
  return !!input.assetTag?.trim();
}

export function namesExternal(input: StandardInput): boolean {
  return !!input.externalRef?.trim();
}

/**
 * A broken chain can be filed anyway, but only with a written reason. The
 * quality manager's report lists every certificate that took this route.
 */
export function overridesTraceability(request: RecordCalibrationDto): boolean {
  return !!request.traceabilityOverrideReason?.trim();
}
