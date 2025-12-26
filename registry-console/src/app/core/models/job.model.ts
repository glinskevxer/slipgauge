import { Tone } from '@shared/tone';

export type JobState =
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DISPATCHED'
  | 'DECLINED';

export type JobPriority = 'STANDARD' | 'PRIORITY' | 'SAME_DAY';

export type JobServiceKind = 'CALIBRATION' | 'ADJUSTMENT' | 'REPAIR' | 'VERIFICATION';

export type ItemCondition = 'SERVICEABLE' | 'DAMAGED' | 'INCOMPLETE' | 'CONTAMINATED';

export type ReviewOutcome = 'ACCEPTED' | 'ACCEPTED_WITH_DEVIATION' | 'DECLINED';

export type AcceptancePolicy = 'SHARED_RISK' | 'STRINGENT' | 'MANAGED_RISK';

export interface JobItemView {
  readonly id: number;
  readonly lineNumber: number;
  readonly service: JobServiceKind;
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
  readonly assetTag: string | null;
  readonly calibratable: boolean;
}

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
  readonly lateness: number;
  readonly open: boolean;
}

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

export interface JobDeskSummary {
  readonly open: number;
  readonly awaitingReview: number;
  readonly onTheBench: number;
  readonly late: number;
  readonly dueToday: number;
  readonly readyToDispatch: number;
}

export interface LineProgress {
  readonly lineNumber: number;
  readonly assetTag: string | null;
  readonly certificateNumber: string | null;
  readonly done: boolean;
  readonly reason: string | null;
}

const STATE_LABELS: Readonly<Record<JobState, string>> = {
  RECEIVED: 'Received',
  UNDER_REVIEW: 'Under review',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'On the bench',
  COMPLETED: 'Ready to go back',
  DISPATCHED: 'Dispatched',
  DECLINED: 'Declined',
};

const PRIORITY_LABELS: Readonly<Record<JobPriority, string>> = {
  STANDARD: 'Standard',
  PRIORITY: 'Priority',
  SAME_DAY: 'Same day',
};

const SERVICE_LABELS: Readonly<Record<JobServiceKind, string>> = {
  CALIBRATION: 'Calibration',
  ADJUSTMENT: 'Adjustment',
  REPAIR: 'Repair',
  VERIFICATION: 'Verification',
};

const CONDITION_LABELS: Readonly<Record<ItemCondition, string>> = {
  SERVICEABLE: 'Serviceable',
  DAMAGED: 'Damaged',
  INCOMPLETE: 'Incomplete',
  CONTAMINATED: 'Contaminated',
};

const OUTCOME_LABELS: Readonly<Record<ReviewOutcome, string>> = {
  ACCEPTED: 'Accepted',
  ACCEPTED_WITH_DEVIATION: 'Accepted with a deviation',
  DECLINED: 'Declined',
};

export function stateLabel(state: JobState): string {
  return STATE_LABELS[state] ?? state;
}

export function priorityLabel(priority: JobPriority): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function serviceLabel(service: JobServiceKind): string {
  return SERVICE_LABELS[service] ?? service;
}

export function conditionLabel(condition: ItemCondition): string {
  return CONDITION_LABELS[condition] ?? condition;
}

export function outcomeLabel(outcome: ReviewOutcome): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}

/**
 * How late a job reads. A job that is not late at all is quiet rather than
 * green: the board is a list of things to worry about, and colouring the
 * ordinary case makes the late ones harder to find.
 */
export function latenessTone(job: Pick<JobSummary, 'lateness' | 'open'>): Tone {
  if (!job.open) {
    return job.lateness > 0 ? 'warn' : 'quiet';
  }
  if (job.lateness > 0) {
    return 'bad';
  }
  return job.lateness >= -1 ? 'warn' : 'quiet';
}

/** The lateness in the words the desk uses on the phone. */
export function latenessInWords(job: Pick<JobSummary, 'lateness' | 'open'>): string {
  const days = job.lateness;

  if (days === 0) {
    return job.open ? 'due today' : 'on the day';
  }
  if (days > 0) {
    return `${days} working day${days === 1 ? '' : 's'} late`;
  }
  const early = Math.abs(days);
  return job.open
    ? `${early} working day${early === 1 ? '' : 's'} to go`
    : `${early} working day${early === 1 ? '' : 's'} early`;
}

/** The next move the desk can make, or null when the job is finished. */
export function nextMove(state: JobState): { readonly action: string; readonly label: string } | null {
  switch (state) {
    case 'ACCEPTED':
      return { action: 'start', label: 'Put on the bench' };
    case 'IN_PROGRESS':
      return { action: 'complete', label: 'Mark finished' };
    case 'COMPLETED':
      return { action: 'dispatch', label: 'Send it back' };
    default:
      return null;
  }
}

/** True when the job is waiting on somebody rather than on the bench. */
export function awaitingDesk(state: JobState): boolean {
  return state === 'RECEIVED' || state === 'UNDER_REVIEW' || state === 'COMPLETED';
}

/** The four review clauses, in the order they are answered. */
export function reviewClauses(
  review: ContractReviewView,
): ReadonlyArray<{ readonly label: string; readonly answered: boolean }> {
  return [
    { label: 'Requirements defined', answered: review.requirementsDefined },
    { label: 'Capability confirmed', answered: review.capabilityConfirmed },
    { label: 'Method selected', answered: review.methodSelected },
    { label: 'Decision rule agreed', answered: review.decisionRuleAgreed },
  ];
}
