import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

import { Discipline } from '../../instrument/instrument.enums';

export class SetScopeLineDto {
  @IsString()
  @MaxLength(64)
  scheduleRef: string;

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

  @IsNumber()
  rangeLow: number;

  @IsNumber()
  rangeHigh: number;

  @IsOptional()
  @IsNumber()
  cmcAbsolute?: number;

  @IsOptional()
  @IsNumber()
  cmcPpm?: number;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export interface ScopeLineView {
  readonly id: number;
  readonly scheduleRef: string;
  readonly discipline: Discipline;
  readonly classCode: string | null;
  readonly measurand: string;
  readonly unit: string;
  readonly rangeLow: number;
  readonly rangeHigh: number;
  readonly cmcAbsolute: number | null;
  readonly cmcPpm: number | null;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly note: string | null;
  readonly live: boolean;
  readonly summary: string;
}
