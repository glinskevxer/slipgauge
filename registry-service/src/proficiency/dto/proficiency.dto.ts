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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { Discipline } from '../../instrument/instrument.enums';
import { ProficiencyOutcome } from '../scoring';
import { RoundState } from '../proficiency.entities';

export class OpenRoundDto {
  @IsString()
  @MaxLength(48)
  reference: string;

  @IsString()
  @MaxLength(160)
  scheme: string;

  @IsString()
  @MaxLength(160)
  provider: string;

  @IsEnum(Discipline)
  discipline: Discipline;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  classCode?: string;

  @IsString()
  @MaxLength(120)
  measurand: string;

  @IsString()
  @MaxLength(24)
  unit: string;

  @IsDateString()
  openedOn: string;

  @IsDateString()
  closesOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

/** One line of what we are sending back to the scheme. */
export class SubmitLineDto {
  @IsInt()
  @Min(1)
  sequenceNo: number;

  @IsString()
  @MaxLength(120)
  performedBy: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  assetTag?: string;

  @IsNumber()
  nominal: number;

  @IsNumber()
  reported: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reportedUncertainty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  comment?: string;
}

export class SubmitRoundDto {
  @ValidateNested({ each: true })
  @Type(() => SubmitLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  lines: SubmitLineDto[];
}

/** One line of the scheme's report. */
export class ScoreLineDto {
  @IsInt()
  @Min(1)
  sequenceNo: number;

  @IsNumber()
  assigned: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  assignedUncertainty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  standardDeviation?: number;
}

export class ScoreRoundDto {
  @ValidateNested({ each: true })
  @Type(() => ScoreLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  lines: ScoreLineDto[];

  @IsOptional()
  @IsDateString()
  reportedOn?: string;
}

export interface ProficiencyResultView {
  readonly id: number;
  readonly sequenceNo: number;
  readonly performedBy: string;
  readonly assetTag: string | null;
  readonly nominal: number;
  readonly reported: number;
  readonly reportedUncertainty: number | null;
  readonly assigned: number | null;
  readonly assignedUncertainty: number | null;
  readonly standardDeviation: number | null;
  readonly enNumber: number | null;
  readonly zScore: number | null;
  readonly outcome: ProficiencyOutcome;
  readonly comment: string | null;
}

export interface ProficiencyRoundView {
  readonly id: number;
  readonly reference: string;
  readonly scheme: string;
  readonly provider: string;
  readonly discipline: Discipline;
  readonly classCode: string | null;
  readonly measurand: string;
  readonly unit: string;
  readonly openedOn: string;
  readonly closesOn: string;
  readonly reportedOn: string | null;
  readonly state: RoundState;
  readonly note: string | null;
  readonly results: readonly ProficiencyResultView[];
  readonly outcome: ProficiencyOutcome;
  readonly open: boolean;
  readonly overdue: boolean;
}
