import { AcceptancePolicy } from '../../calibration/conformity/acceptance-policy';
import { ItemCondition, JobService } from '../job.enums';
import {
  FindingSeverity,
  ReviewClause,
  ReviewFinding,
  finding,
} from './review-clause';

/**
 * What the laboratory can do about one class of instrument, flattened into the
 * handful of facts contract review actually asks about.
 *
 * <p>Deliberately a plain snapshot rather than the entities. The checker is the
 * one piece of contract review that has to be readable end to end by somebody
 * arguing with an assessor about a decision it made, and a function that loads
 * its own data cannot be read that way.
 */
export interface ClassCapability {
  readonly classId: number;
  readonly code: string;
  readonly discipline: string;
  /** A tolerance profile resolves for this class, so a verdict is possible. */
  readonly hasToleranceProfile: boolean;
  /** A reference standard is in calibration and available for this discipline. */
  readonly referenceAvailable: boolean;
  /** The class sits on the accredited scope. */
  readonly accredited: boolean;
  /** The published method, when there is one. */
  readonly methodReference: string | null;
  /** The widest measurement the laboratory holds a standard for, in class units. */
  readonly coveredTo: number | null;
}

/** One line of the job, reduced to what the review reads. */
export interface ReviewableItem {
  readonly lineNumber: number;
  readonly service: JobService;
  readonly condition: ItemCondition;
  readonly classId: number | null;
  readonly description: string;
  /** The top of the customer's stated range, when they stated one. */
  readonly rangeHigh: number | null;
  readonly toleranceStated: boolean;
}

export interface ReviewableJob {
  readonly reference: string;
  readonly items: readonly ReviewableItem[];
  readonly instructions: string | null;
  /** The customer's own contract requires accredited work. */
  readonly accreditedRequired: boolean;
  /** Somebody can be rung about a query. */
  readonly customerReachable: boolean;
  /** The decision rule the desk is proposing, null when nobody chose one. */
  readonly proposedPolicy: AcceptancePolicy | null;
}

/** How the checker is told what the laboratory can do. */
export type CapabilityLookup = (classId: number) => ClassCapability | undefined;

/**
 * Runs contract review over a job and returns everything it found.
 *
 * <p>The clauses are checked in order and every one of them runs, even after an
 * earlier one has failed. Trimming the report is a separate decision, taken by
 * the caller, because the quality manager wants the whole picture and the
 * reviewer at the desk wants the next thing to fix.
 */
export function reviewJob(job: ReviewableJob, capabilityOf: CapabilityLookup): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  checkRequirements(job, findings);
  checkCapability(job, capabilityOf, findings);
  checkMethod(job, capabilityOf, findings);
  checkDecisionRule(job, capabilityOf, findings);
  return findings;
}

function checkRequirements(job: ReviewableJob, out: ReviewFinding[]): void {
  if (job.items.length === 0) {
    out.push(
      finding(
        ReviewClause.REQUIREMENTS,
        FindingSeverity.BLOCKING,
        'nothing was booked in against this job',
      ),
    );
  }

  for (const item of job.items) {
    if (item.classId === null) {
      out.push(
        finding(
          ReviewClause.REQUIREMENTS,
          FindingSeverity.BLOCKING,
          `we cannot tell what "${item.description}" is, so nothing can be quoted for it`,
          item.lineNumber,
        ),
      );
      continue;
    }

    // A verification answers a question the customer has to have asked. Without
    // a stated tolerance there is nothing to verify against and the certificate
    // would say only that a number was read.
    if (item.service === JobService.VERIFICATION && !item.toleranceStated && !job.instructions) {
      out.push(
        finding(
          ReviewClause.REQUIREMENTS,
          FindingSeverity.BLOCKING,
          'a verification needs the tolerance it is being verified against',
          item.lineNumber,
        ),
      );
    }

    if (item.condition !== ItemCondition.SERVICEABLE && item.service === JobService.CALIBRATION) {
      out.push(
        finding(
          ReviewClause.REQUIREMENTS,
          FindingSeverity.DEVIATION,
          `arrived ${item.condition.toLowerCase()}, a calibration on it means something different`,
          item.lineNumber,
        ),
      );
    }
  }

  if (!job.customerReachable) {
    out.push(
      finding(
        ReviewClause.REQUIREMENTS,
        FindingSeverity.NOTE,
        'no contact on file, a query on this job cannot be raised with anybody',
      ),
    );
  }
}

function checkCapability(
  job: ReviewableJob,
  capabilityOf: CapabilityLookup,
  out: ReviewFinding[],
): void {
  for (const item of job.items) {
    if (item.classId === null) {
      continue;
    }
    const capability = capabilityOf(item.classId);

    if (!capability) {
      out.push(
        finding(
          ReviewClause.CAPABILITY,
          FindingSeverity.BLOCKING,
          'the laboratory holds nothing against this class of instrument',
          item.lineNumber,
        ),
      );
      continue;
    }
    if (!capability.hasToleranceProfile) {
      out.push(
        finding(
          ReviewClause.CAPABILITY,
          FindingSeverity.BLOCKING,
          `${capability.code} has no tolerance profile, so no verdict could be stated`,
          item.lineNumber,
        ),
      );
    }
    if (!capability.referenceAvailable) {
      out.push(
        finding(
          ReviewClause.CAPABILITY,
          FindingSeverity.BLOCKING,
          `no reference standard is available for ${capability.discipline.toLowerCase()}`,
          item.lineNumber,
        ),
      );
    }
    if (
      item.rangeHigh !== null &&
      capability.coveredTo !== null &&
      item.rangeHigh > capability.coveredTo
    ) {
      out.push(
        finding(
          ReviewClause.CAPABILITY,
          FindingSeverity.DEVIATION,
          `reads to ${item.rangeHigh}, the laboratory covers ${capability.coveredTo}, ` +
            'the top of the range cannot be certified',
          item.lineNumber,
        ),
      );
    }
    if (job.accreditedRequired && !capability.accredited) {
      out.push(
        finding(
          ReviewClause.CAPABILITY,
          FindingSeverity.DEVIATION,
          `${capability.code} is not on the accredited scope and this customer asked for accredited work`,
          item.lineNumber,
        ),
      );
    }
  }
}

function checkMethod(
  job: ReviewableJob,
  capabilityOf: CapabilityLookup,
  out: ReviewFinding[],
): void {
  for (const item of job.items) {
    if (item.classId === null) {
      continue;
    }
    const capability = capabilityOf(item.classId);

    if (item.service === JobService.REPAIR) {
      out.push(
        finding(
          ReviewClause.METHOD,
          FindingSeverity.NOTE,
          'a repair is not measurement work and carries no method reference',
          item.lineNumber,
        ),
      );
      continue;
    }
    if (capability && !capability.methodReference) {
      out.push(
        finding(
          ReviewClause.METHOD,
          FindingSeverity.DEVIATION,
          `no published method for ${capability.code}, the work would run to bench practice`,
          item.lineNumber,
        ),
      );
    }
  }
}

function checkDecisionRule(
  job: ReviewableJob,
  capabilityOf: CapabilityLookup,
  out: ReviewFinding[],
): void {
  const statesConformity = job.items.some(
    (item) =>
      item.service === JobService.CALIBRATION || item.service === JobService.VERIFICATION,
  );

  if (!statesConformity) {
    return;
  }
  if (job.proposedPolicy === null) {
    out.push(
      finding(
        ReviewClause.DECISION_RULE,
        FindingSeverity.BLOCKING,
        'this job states conformity and no decision rule has been agreed',
      ),
    );
    return;
  }

  // Simple acceptance under an accreditation is defensible, but only where the
  // customer has been told, and this customer's contract says they want the
  // laboratory carrying the risk.
  if (job.accreditedRequired && job.proposedPolicy === AcceptancePolicy.SHARED_RISK) {
    out.push(
      finding(
        ReviewClause.DECISION_RULE,
        FindingSeverity.DEVIATION,
        'simple acceptance leaves the risk with a customer whose contract asks us to carry it',
      ),
    );
  }

  // A stringent rule on a class we are not accredited for promises more than
  // the scope backs. Worth saying, not worth stopping the job over.
  if (job.proposedPolicy === AcceptancePolicy.STRINGENT) {
    const unaccredited = job.items.filter((item) => {
      const capability = item.classId === null ? undefined : capabilityOf(item.classId);
      return capability !== undefined && !capability.accredited;
    });

    for (const item of unaccredited) {
      out.push(
        finding(
          ReviewClause.DECISION_RULE,
          FindingSeverity.NOTE,
          'a stringent rule on unaccredited work still goes out unaccredited',
          item.lineNumber,
        ),
      );
    }
  }
}
