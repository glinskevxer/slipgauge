import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { Discipline } from '../../instrument/instrument.enums';
import { CompetenceLevel } from '../competence-level';

/** Granting somebody an authorisation. Only an approver may do this. */
export class GrantCompetenceDto {
  @IsString()
  @MaxLength(120)
  person: string;

  @IsEnum(Discipline)
  discipline: Discipline;

  /** Narrows the grant to one class. Left out, it covers the discipline. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  classCode?: string;

  @IsEnum(CompetenceLevel)
  level: CompetenceLevel;

  @IsOptional()
  @IsNumber()
  rangeLow?: number;

  @IsOptional()
  @IsNumber()
  rangeHigh?: number;

  @IsDateString()
  authorisedFrom: string;

  @IsOptional()
  @IsDateString()
  authorisedTo?: string;

  /** The training record, witness statement or comparison this rests on. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  evidence?: string;
}

export class WithdrawCompetenceDto {
  @IsString()
  @MaxLength(400)
  reason: string;
}

export interface CompetenceView {
  readonly id: number;
  readonly person: string;
  readonly discipline: Discipline;
  readonly classCode: string | null;
  readonly className: string | null;
  readonly level: CompetenceLevel;
  readonly rangeLow: number | null;
  readonly rangeHigh: number | null;
  readonly authorisedFrom: string;
  readonly authorisedTo: string | null;
  readonly grantedBy: string;
  readonly evidence: string | null;
  readonly withdrawn: boolean;
  readonly withdrawnReason: string | null;
  /** True on the day the view was built. */
  readonly live: boolean;
  /** Calendar days until it runs out, null when it never does. */
  readonly daysRemaining: number | null;
}

/** One row of the matrix: a person against a discipline. */
export interface CompetenceCell {
  readonly person: string;
  readonly discipline: Discipline;
  readonly level: CompetenceLevel | null;
  readonly expiresOn: string | null;
  readonly grants: number;
}

export interface CompetenceMatrix {
  readonly people: readonly string[];
  readonly disciplines: readonly Discipline[];
  readonly cells: readonly CompetenceCell[];
}
