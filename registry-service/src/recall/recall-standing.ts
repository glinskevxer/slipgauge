import type { Criticality, InstrumentStatus } from '../instrument/instrument.enums';
import type { IntervalBasis } from '../interval/interval-basis';

/**
 * Where an instrument sits against its own due date. The bands are what the
 * recall board colours by and what the weekly chase list is built from.
 */
export enum RecallStanding {
  OVERDUE = 'OVERDUE',
  DUE_THIS_WEEK = 'DUE_THIS_WEEK',
  DUE_THIS_MONTH = 'DUE_THIS_MONTH',
  SCHEDULED = 'SCHEDULED',
  NOT_SCHEDULED = 'NOT_SCHEDULED',
}

/** Days between two ISO dates, positive when the second is later. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  return Math.round((end - start) / 86_400_000);
}

export function standingOf(dueOn: string | null, today: string): RecallStanding {
  if (dueOn === null) {
    return RecallStanding.NOT_SCHEDULED;
  }

  const days = daysBetween(today, dueOn);

  if (days < 0) {
    return RecallStanding.OVERDUE;
  }
  if (days <= 7) {
    return RecallStanding.DUE_THIS_WEEK;
  }
  if (days <= 31) {
    return RecallStanding.DUE_THIS_MONTH;
  }
  return RecallStanding.SCHEDULED;
}

export function needsChasing(standing: RecallStanding): boolean {
  return standing === RecallStanding.OVERDUE || standing === RecallStanding.DUE_THIS_WEEK;
}

/** One line of the recall board. */
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
  /** Null rather than a sentinel when nothing is scheduled. */
  readonly daysUntilDue: number | null;
  readonly standing: RecallStanding;
  readonly intervalBasis: IntervalBasis | null;
}

/** What the board summary counts, keyed by standing. */
export type StandingCounts = Record<RecallStanding, number>;

export function emptyCounts(): StandingCounts {
  return {
    [RecallStanding.OVERDUE]: 0,
    [RecallStanding.DUE_THIS_WEEK]: 0,
    [RecallStanding.DUE_THIS_MONTH]: 0,
    [RecallStanding.SCHEDULED]: 0,
    [RecallStanding.NOT_SCHEDULED]: 0,
  };
}

export function countByStanding(entries: readonly RecallEntry[]): StandingCounts {
  const counts = emptyCounts();

  for (const entry of entries) {
    counts[entry.standing] += 1;
  }
  return counts;
}
