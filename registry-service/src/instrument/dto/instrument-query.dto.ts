import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

import { Criticality, Discipline, InstrumentStatus } from '../instrument.enums';

/** A query string list arrives as one value or many; both mean a list. */
function asList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((entry) => String(entry).toUpperCase());
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return value === true || value === 'true' || value === '1';
}

/**
 * The filter bar on the register page, bound straight off the query string.
 * Every field is optional and an absent field means no restriction at all.
 */
export class InstrumentQueryDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsIn(Object.values(InstrumentStatus), { each: true })
  @Transform(({ value }) => asList(value))
  statuses?: InstrumentStatus[];

  @IsOptional()
  @IsArray()
  @IsIn(Object.values(Discipline), { each: true })
  @Transform(({ value }) => asList(value))
  disciplines?: Discipline[];

  @IsOptional()
  @IsArray()
  @IsIn(Object.values(Criticality), { each: true })
  @Transform(({ value }) => asList(value))
  criticalities?: Criticality[];

  @IsOptional()
  @IsString()
  classCode?: string;

  @IsOptional()
  @IsString()
  locationCode?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => asBoolean(value))
  referenceOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => asBoolean(value))
  includeRetired?: boolean;

  @IsOptional()
  @IsDateString({ strict: true })
  acquiredFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  acquiredTo?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  size?: number;

  @IsOptional()
  @IsString()
  sort?: string;
}
