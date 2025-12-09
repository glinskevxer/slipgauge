import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { AcceptancePolicy } from '../../calibration/conformity/acceptance-policy';

/**
 * Recording contract review. The reviewer does not send the four answers: the
 * checker works them out and the reviewer either accepts what it found or
 * declines the job. A reviewer who could type the four answers in would be able
 * to sign off a capability the laboratory does not have.
 */
export class ReviewJobDto {
  /** The decision rule agreed with the customer. */
  @IsEnum(AcceptancePolicy)
  acceptancePolicy: AcceptancePolicy;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  methodReference?: string;

  /** Anything the reviewer wants recorded beside what the checker found. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** Turning work away, which needs a reason a customer can be told. */
export class DeclineJobDto {
  @IsString()
  @MaxLength(400)
  reason: string;
}

/** What a review would say, without recording anything. */
export interface ReviewPreview {
  readonly reference: string;
  readonly outcome: string;
  readonly findings: readonly {
    readonly clause: string;
    readonly severity: string;
    readonly lineNumber: number | null;
    readonly detail: string;
  }[];
  /** True when the job could be accepted as it stands. */
  readonly acceptable: boolean;
  /**
   * True when no decision rule has been proposed yet, so the fourth clause was
   * not judged at all. A preview run before anybody has spoken to the customer
   * should report what the laboratory can do, not tell the reviewer off for not
   * having had the conversation yet.
   */
  readonly decisionRulePending: boolean;
}
