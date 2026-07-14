import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { ItemCondition } from '../../jobs/job.enums';

export class IssueLoanDto {
  @IsString()
  @MaxLength(32)
  assetTag: string;

  @IsString()
  @MaxLength(120)
  borrower: string;

  @IsString()
  @MaxLength(200)
  destination: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  purpose?: string;

  @IsDateString()
  issuedOn: string;

  @IsDateString()
  dueBackOn: string;

  @IsOptional()
  @IsEnum(ItemCondition)
  conditionOut?: ItemCondition;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class ReturnLoanDto {
  @IsDateString()
  returnedOn: string;

  /** Required. An instrument taken back without a look is not checked. */
  @IsEnum(ItemCondition)
  conditionBack: ItemCondition;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export interface LoanView {
  readonly id: number;
  readonly assetTag: string;
  readonly borrower: string;
  readonly destination: string;
  readonly purpose: string | null;
  readonly issuedOn: string;
  readonly dueBackOn: string;
  readonly returnedOn: string | null;
  readonly issuedBy: string;
  readonly receivedBy: string | null;
  readonly conditionOut: ItemCondition;
  readonly conditionBack: ItemCondition | null;
  readonly note: string | null;
  readonly out: boolean;
  readonly lateness: number;
  readonly overdue: boolean;
  /** True when it came back worse than it went out. */
  readonly cameBackWorse: boolean;
  readonly summary: string;
}
