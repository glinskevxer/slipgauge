import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { ImpactDisposition } from '../impact-severity';

export class DisposeItemDto {
  @IsEnum(ImpactDisposition)
  disposition: ImpactDisposition;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class CloseAssessmentDto {
  @IsString()
  @MaxLength(120)
  closedBy: string;

  @IsString()
  @MaxLength(2000)
  conclusion: string;
}
