import { Tone } from '@shared/tone';

export type CapaStage =
  | 'RAISED'
  | 'CONTAINED'
  | 'CAUSE_FOUND'
  | 'ACTION_TAKEN'
  | 'EFFECTIVENESS_CHECKED'
  | 'CLOSED'
  | 'ABANDONED';

export type NonconformitySource =
  | 'EXCURSION'
  | 'OUT_OF_TOLERANCE'
  | 'COMPLAINT'
  | 'AUDIT'
  | 'PROFICIENCY'
  | 'OTHER';

export type NonconformitySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface NonconformanceView {
  readonly id: number;
  readonly reference: string;
  readonly raisedOn: string;
  readonly raisedBy: string;
  readonly source: NonconformitySource;
  readonly sourceRef: string | null;
  readonly title: string;
  readonly detail: string;
  readonly severity: NonconformitySeverity;
  readonly state: CapaStage;
  readonly owner: string | null;
  readonly dueOn: string | null;
  readonly containment: string | null;
  readonly containedOn: string | null;
  readonly rootCause: string | null;
  readonly causeFoundOn: string | null;
  readonly correctiveAction: string | null;
  readonly actionTakenOn: string | null;
  readonly effectiveness: string | null;
  readonly effectivenessOn: string | null;
  readonly closedOn: string | null;
  readonly closedBy: string | null;
  readonly open: boolean;
  readonly lateness: number;
  readonly escalate: boolean;
  readonly answersGiven: number;
  readonly closesFrom: CapaStage;
}

export interface CapaSummary {
  readonly open: number;
  readonly late: number;
  readonly escalating: number;
  readonly high: number;
  readonly closedThisYear: number;
  readonly byStage: Readonly<Record<string, number>>;
}

const STAGE_LABELS: Readonly<Record<CapaStage, string>> = {
  RAISED: 'Raised',
  CONTAINED: 'Contained',
  CAUSE_FOUND: 'Cause found',
  ACTION_TAKEN: 'Action taken',
  EFFECTIVENESS_CHECKED: 'Effectiveness checked',
  CLOSED: 'Closed',
  ABANDONED: 'Abandoned',
};

const SOURCE_LABELS: Readonly<Record<NonconformitySource, string>> = {
  EXCURSION: 'Room excursion',
  OUT_OF_TOLERANCE: 'Out of tolerance',
  COMPLAINT: 'Customer complaint',
  AUDIT: 'Internal audit',
  PROFICIENCY: 'Proficiency test',
  OTHER: 'Other',
};

/** The route each stage's answer is posted to. */
const STAGE_ROUTES: Readonly<Partial<Record<CapaStage, string>>> = {
  CONTAINED: 'containment',
  CAUSE_FOUND: 'cause',
  ACTION_TAKEN: 'action',
  EFFECTIVENESS_CHECKED: 'effectiveness',
};

/** The order the stages run in, which is the order the panel shows them. */
export const STAGE_ORDER: readonly CapaStage[] = [
  'RAISED',
  'CONTAINED',
  'CAUSE_FOUND',
  'ACTION_TAKEN',
  'EFFECTIVENESS_CHECKED',
  'CLOSED',
];

export function stageLabel(stage: CapaStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function sourceLabel(source: NonconformitySource): string {
  return SOURCE_LABELS[source] ?? source;
}

export function stageRoute(stage: CapaStage): string | null {
  return STAGE_ROUTES[stage] ?? null;
}

export function severityTone(severity: NonconformitySeverity): Tone {
  switch (severity) {
    case 'HIGH':
      return 'bad';
    case 'MEDIUM':
      return 'warn';
    default:
      return 'quiet';
  }
}

/** The stage this record is waiting for, or null once it is finished. */
export function awaitingStage(record: NonconformanceView): CapaStage | null {
  const at = STAGE_ORDER.indexOf(record.state);

  if (at < 0 || record.state === 'CLOSED') {
    return null;
  }
  return STAGE_ORDER[at + 1] ?? null;
}

/** True when the record has done enough that a quality manager may close it. */
export function closeable(record: NonconformanceView): boolean {
  return (
    record.open &&
    STAGE_ORDER.indexOf(record.state) >= STAGE_ORDER.indexOf(record.closesFrom)
  );
}

/**
 * How far along a record is, as a fraction. Measured against what its own
 * severity needs rather than against all four stages: a low severity record
 * that has had its action taken is finished, and showing it three quarters done
 * makes the board read as though nobody ever finishes anything.
 */
export function progressOf(record: NonconformanceView): number {
  const needed = STAGE_ORDER.indexOf(record.closesFrom);
  const at = STAGE_ORDER.indexOf(record.state);

  if (needed <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, at / needed));
}

/** How the lateness reads on the board. */
export function latenessInWords(record: NonconformanceView): string {
  if (record.dueOn === null) {
    return 'no date set';
  }
  const days = record.lateness;

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} late`;
  }
  if (days === 0) {
    return record.open ? 'due today' : 'on the day';
  }
  const left = Math.abs(days);
  return record.open ? `${left} day${left === 1 ? '' : 's'} left` : 'closed in time';
}

export function latenessTone(record: NonconformanceView): Tone {
  if (!record.open) {
    return 'quiet';
  }
  if (record.escalate) {
    return 'bad';
  }
  return record.lateness >= 0 ? 'warn' : 'quiet';
}
