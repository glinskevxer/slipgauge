import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

import { AcceptancePolicy } from '../calibration/conformity/acceptance-policy';
import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { Job } from './job.entity';
import {
  FindingSeverity,
  ReviewClause,
  ReviewFinding,
  ReviewOutcome,
  clausePasses,
  describeFinding,
} from './review/review-clause';

/**
 * The written answer to contract review for one job.
 *
 * <p>Stored against the job it reviewed rather than in its own sequence, so a
 * job can never end up with two current reviews. The findings are held as text
 * because that is what the assessor reads; the structured form of them lives
 * only long enough to produce it.
 */
@Entity({ name: 'contract_review' })
export class ContractReview extends AuditedEntity {
  @PrimaryColumn({ name: 'job_id', type: 'int' })
  jobId: number;

  @OneToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ type: 'varchar', length: 24 })
  outcome: ReviewOutcome;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 120 })
  reviewedBy: string;

  @Column({ name: 'reviewed_on', type: 'date' })
  reviewedOn: string;

  @Column({ name: 'requirements_defined', type: 'boolean' })
  requirementsDefined: boolean;

  @Column({ name: 'capability_confirmed', type: 'boolean' })
  capabilityConfirmed: boolean;

  @Column({ name: 'method_selected', type: 'boolean' })
  methodSelected: boolean;

  @Column({ name: 'decision_rule_agreed', type: 'boolean' })
  decisionRuleAgreed: boolean;

  /**
   * The decision rule the customer agreed to. Null only on a declined job,
   * because a job that is going to be worked on has one whether or not anybody
   * discussed it, and leaving it unsaid is how a certificate ends up stating
   * conformity under a rule nobody chose.
   */
  @Column({ name: 'acceptance_policy', type: 'varchar', length: 24, nullable: true })
  acceptancePolicy: AcceptancePolicy | null;

  @Column({ name: 'method_reference', type: 'varchar', length: 120, nullable: true })
  methodReference: string | null;

  @Column({ type: 'text', nullable: true })
  findings: string | null;

  @Column({ name: 'declined_reason', type: 'varchar', length: 400, nullable: true })
  declinedReason: string | null;

  /** True when every clause was answered yes. */
  isClean(): boolean {
    return (
      this.requirementsDefined &&
      this.capabilityConfirmed &&
      this.methodSelected &&
      this.decisionRuleAgreed
    );
  }

  /** True when the job may proceed to the bench. */
  permitsWork(): boolean {
    return (
      this.outcome === ReviewOutcome.ACCEPTED ||
      this.outcome === ReviewOutcome.ACCEPTED_WITH_DEVIATION
    );
  }

  /**
   * Checks the record hangs together before it is written. The database says
   * the same thing, and it is said here too so the caller gets a sentence
   * rather than a constraint name.
   */
  validate(): void {
    if (this.outcome === ReviewOutcome.ACCEPTED && !this.isClean()) {
      throw new RuleViolationError(
        'a clean acceptance needs all four clauses answered yes, ' +
          'record a deviation instead',
      );
    }
    if (this.outcome === ReviewOutcome.DECLINED && !this.declinedReason) {
      throw new RuleViolationError('a declined job has to say why');
    }
    if (this.outcome === ReviewOutcome.ACCEPTED_WITH_DEVIATION && !this.findings) {
      throw new RuleViolationError('a deviation has to be written down');
    }
    if (this.permitsWork() && !this.acceptancePolicy) {
      throw new RuleViolationError(
        'a job that is going to the bench needs the agreed decision rule recorded',
      );
    }
  }
}

/**
 * Builds the review record from the findings the checker raised, so the four
 * booleans can never disagree with the text beside them.
 */
export function reviewFrom(
  jobId: number,
  outcome: ReviewOutcome,
  reviewedBy: string,
  reviewedOn: string,
  findings: readonly ReviewFinding[],
): ContractReview {
  const review = new ContractReview();

  review.jobId = jobId;
  review.outcome = outcome;
  review.reviewedBy = reviewedBy;
  review.reviewedOn = reviewedOn;
  review.requirementsDefined = clausePasses(ReviewClause.REQUIREMENTS, findings);
  review.capabilityConfirmed = clausePasses(ReviewClause.CAPABILITY, findings);
  review.methodSelected = clausePasses(ReviewClause.METHOD, findings);
  review.decisionRuleAgreed = clausePasses(ReviewClause.DECISION_RULE, findings);
  review.acceptancePolicy = null;
  review.methodReference = null;
  review.findings = findings.length ? findings.map(describeFinding).join('\n') : null;
  review.declinedReason =
    outcome === ReviewOutcome.DECLINED ? blockingReason(findings) : null;
  return review;
}

/** The first thing that made the job impossible, which is what gets quoted. */
function blockingReason(findings: readonly ReviewFinding[]): string {
  const blocking = findings.find((item) => item.severity === FindingSeverity.BLOCKING);

  return blocking ? describeFinding(blocking) : 'declined at contract review';
}
