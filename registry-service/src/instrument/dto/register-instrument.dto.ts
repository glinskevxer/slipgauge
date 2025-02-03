import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * What the goods inwards bench types when a new instrument arrives. The asset
 * tag is deliberately absent, because the service allocates it.
 */
export class RegisterInstrumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  classCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  manufacturer: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  serialNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  unit: string;

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

  @IsDateString({ strict: true })
  acquiredOn: string;
}
