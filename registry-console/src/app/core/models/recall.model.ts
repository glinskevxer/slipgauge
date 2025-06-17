import { Tone } from '@shared/tone';
import { Criticality, InstrumentStatus } from './instrument.model';

export type RecallStanding =
  | 'OVERDUE'
  | 'DUE_THIS_WEEK'
  | 'DUE_THIS_MONTH'
  | 'SCHEDULED'
  | 'NOT_SCHEDULED';

export type IntervalBasis =
  | 'BASE'
  | 'EXTENDED'
  | 'HELD'
  | 'SHORTENED'
  | 'FLOORED'
  | 'CAPPED'
  | 'MANUAL'
  | 'RESET';

export interface RecallEntry {
  readonly instrumentId: number;
  readonly assetTag: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly classCode: string;
  readonly criticality: Criticality;
  readonly status: InstrumentStatus;
  readonly referenceStandard: boolean;
  readonly locationCode: string | null;
  readonly custodian: string | null;
  readonly lastCalibratedOn: string | null;
  readonly intervalDays: number | null;
  readonly nextDueOn: string | null;
  readonly daysUntilDue: number;
  readonly standing: RecallStanding;
  readonly intervalBasis: IntervalBasis | null;
}

export interface IntervalSummary {
  readonly id: number;
  readonly effectiveFrom: string;
  readonly intervalDays: number;
  readonly previousIntervalDays: number | null;
  readonly delta: number;
  readonly basis: IntervalBasis;
  readonly consecutivePasses: number;
  readonly driftRatio: number | null;
  readonly rationale: string;
  readonly current: boolean;
}

const STANDING_LABELS: Readonly<Record<RecallStanding, string>> = {
  OVERDUE: 'Overdue',
  DUE_THIS_WEEK: 'Due this week',
  DUE_THIS_MONTH: 'Due this month',
  SCHEDULED: 'Scheduled',
  NOT_SCHEDULED: 'Not scheduled',
};

export function standingLabel(standing: RecallStanding): string {
  return STANDING_LABELS[standing];
}

const BASIS_LABELS: Readonly<Record<IntervalBasis, string>> = {
  BASE: 'Class default',
  EXTENDED: 'Extended',
  HELD: 'Held',
  SHORTENED: 'Shortened',
  FLOORED: 'At class floor',
  CAPPED: 'At class ceiling',
  MANUAL: 'Set by hand',
  RESET: 'Reset',
};

export function basisLabel(basis: IntervalBasis): string {
  return BASIS_LABELS[basis];
}

export function standingTone(standing: RecallStanding): Tone {
  switch (standing) {
    case 'OVERDUE':
      return 'bad';
    case 'DUE_THIS_WEEK':
      return 'warn';
    case 'DUE_THIS_MONTH':
    case 'SCHEDULED':
      return 'ok';
    default:
      return 'unknown';
  }
}

/** Reads as "in 12 days" or "9 days ago", which is what the board shows. */
export function dueInWords(daysUntilDue: number): string {
  if (!Number.isFinite(daysUntilDue) || daysUntilDue > 100000) {
    return 'no due date';
  }
  if (daysUntilDue === 0) {
    return 'today';
  }
  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return `in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
}
