import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { CapaStage, NonconformitySeverity, NonconformitySource } from '../capa-stage';

export class RaiseNonconformanceDto {
  @IsEnum(NonconformitySource)
  source: NonconformitySource;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceRef?: string;

  @IsEnum(NonconformitySeverity)
  severity: NonconformitySeverity;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(4000)
  detail: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  owner?: string;

  @IsOptional()
  @IsDateString()
  dueOn?: string;
}

/**
 * One stage's answer. The same shape for all four, because the difference
 * between them is which column it lands in and nothing else.
 */
export class RecordStageDto {
  @IsString()
  @MaxLength(1000)
  text: string;

  @IsOptional()
  @IsDateString()
  on?: string;
}

export class AssignNonconformanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  owner?: string;

  @IsOptional()
  @IsDateString()
  dueOn?: string;
}

export class AbandonNonconformanceDto {
  @IsString()
  @MaxLength(400)
  reason: string;
}

export interface NonconformanceView {
  readonly id: number;
  readonly reference: string;
  readonly raisedOn: string;
  readonly raisedBy: string;
  readonly source: NonconformitySource;
  readonly sourceRef: string | null;
  readonly title: string;
  readonly detail: string;
  readonly severity: NonconformitySeverity;
  readonly state: CapaStage;
  readonly owner: string | null;
  readonly dueOn: string | null;
  readonly containment: string | null;
  readonly containedOn: string | null;
  readonly rootCause: string | null;
  readonly causeFoundOn: string | null;
  readonly correctiveAction: string | null;
  readonly actionTakenOn: string | null;
  readonly effectiveness: string | null;
  readonly effectivenessOn: string | null;
  readonly closedOn: string | null;
  readonly closedBy: string | null;
  readonly open: boolean;
  readonly lateness: number;
  readonly escalate: boolean;
  readonly answersGiven: number;
  /** The stage this record has to reach before it may be closed. */
  readonly closesFrom: CapaStage;
}

/** The counts across the top of the board. */
export interface CapaSummary {
  readonly open: number;
  readonly late: number;
  readonly escalating: number;
  readonly high: number;
  readonly closedThisYear: number;
  readonly byStage: Readonly<Record<string, number>>;
}
