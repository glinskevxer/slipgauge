import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A correction to an already registered instrument. Serial number, model and
 * manufacturer are absent on purpose. Those three identify the physical thing,
 * and changing them would silently turn one asset into another.
 */
export class UpdateInstrumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string | null;

  @IsNumber()
  @Type(() => Number)
  rangeLow: number;

  @IsNumber()
  @Type(() => Number)
  rangeHigh: number;

  @IsNumber()
  @Type(() => Number)
  resolution: number;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  locationCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  custodian?: string | null;

  @IsBoolean()
  referenceStandard: boolean;
}
