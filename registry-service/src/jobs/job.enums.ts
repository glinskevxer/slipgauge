import { InvalidTransitionError } from '../common/errors';

/**
 * Where a job has got to. The states are the desk's own words, and the order
 * here is the order the paperwork moves in.
 */
export enum JobState {
  /** Items are on the receiving bench, nothing has been promised yet. */
  RECEIVED = 'RECEIVED',
  /** Contract review is under way. */
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** Review passed, the items are in the register and the work can start. */
  ACCEPTED = 'ACCEPTED',
  /** At least one line has been worked on. */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Every line is finished and the certificates are signed. */
  COMPLETED = 'COMPLETED',
  /** Back with the customer. */
  DISPATCHED = 'DISPATCHED',
  /** Review failed, or the customer withdrew it. */
  DECLINED = 'DECLINED',
}

export enum JobPriority {
  STANDARD = 'STANDARD',
  PRIORITY = 'PRIORITY',
  SAME_DAY = 'SAME_DAY',
}

/** What the customer asked for on one line. */
export enum JobService {
  CALIBRATION = 'CALIBRATION',
  ADJUSTMENT = 'ADJUSTMENT',
  REPAIR = 'REPAIR',
  VERIFICATION = 'VERIFICATION',
}

/** How the item turned up, recorded before anybody touches it. */
export enum ItemCondition {
  SERVICEABLE = 'SERVICEABLE',
  DAMAGED = 'DAMAGED',
  INCOMPLETE = 'INCOMPLETE',
  CONTAMINATED = 'CONTAMINATED',
}

/**
 * The moves the desk is allowed to make. A job never goes backwards: a mistake
 * on an accepted job is corrected by declining it and booking the items in
 * again, because the register already holds instrument rows against the first
 * one and quietly reusing them loses the receiving date.
 */
const ALLOWED: Readonly<Record<JobState, readonly JobState[]>> = {
  [JobState.RECEIVED]: [JobState.UNDER_REVIEW, JobState.DECLINED],
  [JobState.UNDER_REVIEW]: [JobState.ACCEPTED, JobState.DECLINED],
  [JobState.ACCEPTED]: [JobState.IN_PROGRESS, JobState.DECLINED],
  [JobState.IN_PROGRESS]: [JobState.COMPLETED],
  [JobState.COMPLETED]: [JobState.DISPATCHED],
  [JobState.DISPATCHED]: [],
  [JobState.DECLINED]: [],
};

export function jobTransitionsFrom(state: JobState): readonly JobState[] {
  return ALLOWED[state] ?? [];
}

export function canMoveJob(from: JobState, to: JobState): boolean {
  return jobTransitionsFrom(from).includes(to);
}

export function requireJobMove(reference: string, from: JobState, to: JobState): void {
  if (from === to) {
    throw new InvalidTransitionError(`${reference} is already ${to}`);
  }
  if (!canMoveJob(from, to)) {
    const options = jobTransitionsFrom(from);
    const available = options.length ? options.join(', ') : 'nothing, it is finished';

    throw new InvalidTransitionError(
      `${reference} is ${from} and cannot move to ${to}, only to ${available}`,
    );
  }
}

/** True while the job is still the laboratory's problem. */
export function jobIsOpen(state: JobState): boolean {
  return (
    state === JobState.RECEIVED ||
    state === JobState.UNDER_REVIEW ||
    state === JobState.ACCEPTED ||
    state === JobState.IN_PROGRESS
  );
}

/** True once the items have been handed back or refused. */
export function jobIsClosed(state: JobState): boolean {
  return state === JobState.DISPATCHED || state === JobState.DECLINED;
}

/**
 * How many working days the priority buys. Saturday and Sunday are not worked,
 * so the desk quotes in working days and the promise date is worked out from
 * them rather than the other way round.
 */
export function turnaroundFor(priority: JobPriority, standardDays: number): number {
  switch (priority) {
    case JobPriority.SAME_DAY:
      return 0;
    case JobPriority.PRIORITY:
      return Math.max(1, Math.ceil(standardDays / 3));
    default:
      return standardDays;
  }
}
