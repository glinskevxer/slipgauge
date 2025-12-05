import { AcceptancePolicy } from '../../calibration/conformity/acceptance-policy';
import { ItemCondition, JobPriority, JobService, JobState } from '../job.enums';
import { ReviewOutcome } from '../review/review-clause';

/** One line as the desk reads it. */
export interface JobItemView {
  readonly id: number;
  readonly lineNumber: number;
  readonly service: JobService;
  readonly description: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly classCode: string | null;
  readonly className: string | null;
  readonly condition: ItemCondition;
  readonly accessories: string | null;
  readonly note: string | null;
  readonly rangeHigh: number | null;
  readonly toleranceStated: boolean;
  /** The register row raised for this line, once the job was accepted. */
  readonly assetTag: string | null;
  readonly calibratable: boolean;
}

/** The review as it reads on the job sheet. */
export interface ContractReviewView {
  readonly outcome: ReviewOutcome;
  readonly reviewedBy: string;
  readonly reviewedOn: string;
  readonly requirementsDefined: boolean;
  readonly capabilityConfirmed: boolean;
  readonly methodSelected: boolean;
  readonly decisionRuleAgreed: boolean;
  readonly acceptancePolicy: AcceptancePolicy | null;
  readonly methodReference: string | null;
  readonly findings: readonly string[];
  readonly declinedReason: string | null;
}

/** A job, everything about it. */
export interface JobView {
  readonly id: number;
  readonly reference: string;
  readonly customerCode: string;
  readonly customerName: string;
  readonly state: JobState;
  readonly priority: JobPriority;
  readonly receivedOn: string;
  readonly promisedOn: string;
  readonly completedOn: string | null;
  readonly dispatchedOn: string | null;
  readonly receivedBy: string;
  readonly customerOrder: string | null;
  readonly instructions: string | null;
  readonly items: readonly JobItemView[];
  readonly review: ContractReviewView | null;
  /** Working days late, negative while there is still time. */
  readonly lateness: number;
  readonly open: boolean;
}

/** The desk list, which is a job without its lines. */
export interface JobSummary {
  readonly id: number;
  readonly reference: string;
  readonly customerCode: string;
  readonly customerName: string;
  readonly state: JobState;
  readonly priority: JobPriority;
  readonly receivedOn: string;
  readonly promisedOn: string;
  readonly itemCount: number;
  readonly lateness: number;
  readonly open: boolean;
}

/** The counts across the top of the desk. */
export interface JobDeskSummary {
  readonly open: number;
  readonly awaitingReview: number;
  readonly onTheBench: number;
  readonly late: number;
  readonly dueToday: number;
  readonly readyToDispatch: number;
}
