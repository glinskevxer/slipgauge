import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
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

import { AcceptancePolicy } from '../../calibration/conformity/acceptance-policy';
import { ItemCondition, JobPriority, JobService } from '../job.enums';

/**
 * One line of the receiving note. Everything except the service and the
 * description is optional, because goods inwards types this with the item in
 * one hand and the desk fills the rest in later.
 */
export class BookInItemDto {
  @IsEnum(JobService)
  service: JobService;

  @IsString()
  @MaxLength(300)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  /** The class code the desk decided it belongs to, when they could tell. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  classCode?: string;

  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  accessories?: string;

  /** The top of the customer's stated range, used at contract review. */
  @IsOptional()
  @IsNumber()
  rangeHigh?: number;

  /** The customer said what they want it held to, which a verification needs. */
  @IsOptional()
  @IsBoolean()
  toleranceStated?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

/**
 * A delivery. One customer, one date, one receiving note, however many items
 * came in the box.
 */
export class BookInJobDto {
  @IsString()
  @MaxLength(24)
  customerCode: string;

  @IsDateString()
  receivedOn: string;

  @IsString()
  @MaxLength(120)
  receivedBy: string;

  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;

  /**
   * The decision rule the desk is proposing. Not required to book in, because
   * goods inwards do not agree decision rules, but contract review will not
   * pass without one.
   */
  @IsOptional()
  @IsEnum(AcceptancePolicy)
  proposedPolicy?: AcceptancePolicy;

  @ValidateNested({ each: true })
  @Type(() => BookInItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  items: BookInItemDto[];
}

/** Moving the promise date by hand, which the desk does after a phone call. */
export class RepromiseJobDto {
  @IsDateString()
  promisedOn: string;

  @IsString()
  @MaxLength(400)
  reason: string;
}

/** Adding a line to a job that is already open. */
export class AddJobItemDto extends BookInItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  lineNumber?: number;
}
