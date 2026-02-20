import { InvalidTransitionError } from '../common/errors';

/**
 * The stages a nonconformance goes through, and the order they go in.
 *
 * <p>The order is the point. Containment before cause because the bleeding is
 * stopped before it is understood; cause before action because an action chosen
 * without a cause is a guess; action before effectiveness because there is
 * nothing to check otherwise. A laboratory that closes at containment has
 * stopped one instance and learned nothing, which is what clause 8.7 is written
 * to prevent.
 */
export enum CapaStage {
  RAISED = 'RAISED',
  CONTAINED = 'CONTAINED',
  CAUSE_FOUND = 'CAUSE_FOUND',
  ACTION_TAKEN = 'ACTION_TAKEN',
  EFFECTIVENESS_CHECKED = 'EFFECTIVENESS_CHECKED',
  CLOSED = 'CLOSED',
  /** Raised in error, or overtaken by another record. Never a quiet delete. */
  ABANDONED = 'ABANDONED',
}

export enum NonconformitySource {
  EXCURSION = 'EXCURSION',
  OUT_OF_TOLERANCE = 'OUT_OF_TOLERANCE',
  COMPLAINT = 'COMPLAINT',
  AUDIT = 'AUDIT',
  PROFICIENCY = 'PROFICIENCY',
  OTHER = 'OTHER',
}

export enum NonconformitySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

const ORDER: readonly CapaStage[] = [
  CapaStage.RAISED,
  CapaStage.CONTAINED,
  CapaStage.CAUSE_FOUND,
  CapaStage.ACTION_TAKEN,
  CapaStage.EFFECTIVENESS_CHECKED,
  CapaStage.CLOSED,
];

/**
 * How far a severity has to get before it may be closed.
 *
 * <p>A low severity record can be closed once the cause is known and something
 * was done: making somebody prove effectiveness for a mislabelled box is how a
 * CAPA system fills up with records nobody finishes. A high severity one has to
 * go the whole way, because that is the case the requirement exists for.
 */
const CLOSE_FROM: Readonly<Record<NonconformitySeverity, CapaStage>> = {
  [NonconformitySeverity.LOW]: CapaStage.ACTION_TAKEN,
  [NonconformitySeverity.MEDIUM]: CapaStage.ACTION_TAKEN,
  [NonconformitySeverity.HIGH]: CapaStage.EFFECTIVENESS_CHECKED,
};

/** Working days a severity is allowed before it is overdue. */
const ALLOWED_DAYS: Readonly<Record<NonconformitySeverity, number>> = {
  [NonconformitySeverity.LOW]: 60,
  [NonconformitySeverity.MEDIUM]: 30,
  [NonconformitySeverity.HIGH]: 10,
};

export function stageRank(stage: CapaStage): number {
  return ORDER.indexOf(stage);
}

export function isTerminal(stage: CapaStage): boolean {
  return stage === CapaStage.CLOSED || stage === CapaStage.ABANDONED;
}

export function isOpen(stage: CapaStage): boolean {
  return !isTerminal(stage);
}

/** The stage that comes next, or null at the end of the line. */
export function nextStage(stage: CapaStage): CapaStage | null {
  const at = stageRank(stage);

  return at < 0 || at >= ORDER.length - 1 ? null : ORDER[at + 1];
}

/**
 * Whether a record at this stage and severity may be closed.
 *
 * <p>Read this as the rule that the severity decides how much work closing
 * takes, which is the composition the whole file is here for: the severity is
 * not a label, it changes what the other stages are allowed to do.
 */
export function mayClose(stage: CapaStage, severity: NonconformitySeverity): boolean {
  return stageRank(stage) >= stageRank(CLOSE_FROM[severity]);
}

export function stageNeededToClose(severity: NonconformitySeverity): CapaStage {
  return CLOSE_FROM[severity];
}

/** Moves are one step forward, or straight to abandoned from anywhere open. */
export function canMove(from: CapaStage, to: CapaStage): boolean {
  if (isTerminal(from)) {
    return false;
  }
  if (to === CapaStage.ABANDONED) {
    return true;
  }
  return nextStage(from) === to;
}

export function requireMove(reference: string, from: CapaStage, to: CapaStage): void {
  if (canMove(from, to)) {
    return;
  }
  if (isTerminal(from)) {
    throw new InvalidTransitionError(`${reference} is ${from} and is finished`);
  }
  const expected = nextStage(from);

  throw new InvalidTransitionError(
    `${reference} is ${from}, the next stage is ${expected ?? 'nothing'} and not ${to}`,
  );
}

/** Days a severity buys before the record is late. */
export function allowedDaysFor(severity: NonconformitySeverity): number {
  return ALLOWED_DAYS[severity];
}

/**
 * How overdue a record is, in days. Negative while there is still time.
 * A closed record is measured against the day it closed, so the board does not
 * fill up with records that went late years ago and were then finished.
 */
export function latenessOf(
  dueOn: string | null,
  closedOn: string | null,
  today: string,
): number {
  if (dueOn === null) {
    return 0;
  }
  const measured = closedOn ?? today;

  return Math.round(
    (Date.parse(`${measured}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Whether the record needs escalating.
 *
 * <p>Two ways in, and they are independent: anything high severity that is late
 * at all, and anything of any severity that has sat at the same stage past twice
 * its allowance. The second catches the record that was quietly reassigned to
 * somebody who left.
 */
export function needsEscalation(
  severity: NonconformitySeverity,
  stage: CapaStage,
  dueOn: string | null,
  today: string,
): boolean {
  if (isTerminal(stage)) {
    return false;
  }
  const late = latenessOf(dueOn, null, today);

  if (severity === NonconformitySeverity.HIGH && late > 0) {
    return true;
  }
  return late > allowedDaysFor(severity);
}

/** How the stage reads on the board. */
export function stageLabel(stage: CapaStage): string {
  switch (stage) {
    case CapaStage.RAISED:
      return 'Raised';
    case CapaStage.CONTAINED:
      return 'Contained';
    case CapaStage.CAUSE_FOUND:
      return 'Cause found';
    case CapaStage.ACTION_TAKEN:
      return 'Action taken';
    case CapaStage.EFFECTIVENESS_CHECKED:
      return 'Effectiveness checked';
    case CapaStage.CLOSED:
      return 'Closed';
    case CapaStage.ABANDONED:
      return 'Abandoned';
    default:
      return stage;
  }
}
