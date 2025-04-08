/**
 * Why an interval came out as it did. The recall list groups by this, and the
 * quality report counts SHORTENED and FLOORED decisions as the measure of how
 * much trouble a class of instrument is giving.
 */
export enum IntervalBasis {
  /** Nothing to go on yet, so the class default stands. */
  BASE = 'BASE',
  /** A run of clean results earned a step up. */
  EXTENDED = 'EXTENDED',
  /** A marginal or unstatable result, so the interval stayed where it was. */
  HELD = 'HELD',
  /** An out of tolerance result cut the interval. */
  SHORTENED = 'SHORTENED',
  /** The cut hit the floor the class allows. */
  FLOORED = 'FLOORED',
  /** The extension hit the ceiling the class allows. */
  CAPPED = 'CAPPED',
  /** A person overrode the engine and said why. */
  MANUAL = 'MANUAL',
  /** History was invalidated, so the engine started again from the base. */
  RESET = 'RESET',
}

export function earnedTime(basis: IntervalBasis): boolean {
  return basis === IntervalBasis.EXTENDED || basis === IntervalBasis.CAPPED;
}

export function lostTime(basis: IntervalBasis): boolean {
  return basis === IntervalBasis.SHORTENED || basis === IntervalBasis.FLOORED;
}

/** What the engine worked out, before anything is written down. */
export interface IntervalOutcome {
  /** The interval to run from here. */
  readonly intervalDays: number;
  /** Why it came out that way. */
  readonly basis: IntervalBasis;
  /** Clean as found results in a row at this point. */
  readonly consecutivePasses: number;
  /** Worst as found error as a fraction of tolerance, null when unmeasured. */
  readonly driftRatio: number | null;
  /** A sentence for the decision record. */
  readonly rationale: string;
}

export function movedFrom(outcome: IntervalOutcome, previous: number): boolean {
  return outcome.intervalDays !== previous;
}
