import { Criticality } from '@core/models/instrument.model';
import { RecallEntry } from '@core/models/recall.model';

/**
 * Levelling the recall workload.
 *
 * <p>The laboratory has a fixed number of bench hours a week and a recall list
 * that arrives in lumps, because instruments bought together fall due together.
 * This works out where the lumps are and what could be pulled forward to
 * flatten them.
 *
 * <p>Pulling forward is always allowed; pushing back is not. An instrument's
 * due date is the last day it may be used, so moving it later is a decision
 * about risk rather than about scheduling, and it is not made here.
 */

/** Bench hours a calibration takes, by criticality. Measured, not guessed. */
const HOURS: Readonly<Record<Criticality, number>> = {
  ROUTINE: 0.75,
  IMPORTANT: 1.5,
  CRITICAL: 3.5,
};

export interface Week {
  readonly index: number;
  readonly startsOn: string;
  readonly entries: readonly RecallEntry[];
  readonly hours: number;
  readonly overdue: number;
}

export interface CapacityPlan {
  readonly weeks: readonly Week[];
  readonly capacityHours: number;
  readonly totalHours: number;
  readonly overloadedWeeks: number;
  readonly worstWeek: Week | null;
}

export function hoursFor(entry: RecallEntry): number {
  return HOURS[entry.criticality];
}

export function hoursOf(entries: readonly RecallEntry[]): number {
  return entries.reduce((total, entry) => total + hoursFor(entry), 0);
}

/**
 * Buckets the recall list into weeks from a given Monday. Anything already
 * overdue lands in week zero, because it is work for now whatever its date.
 */
export function plan(
  entries: readonly RecallEntry[],
  capacityHours: number,
  weeks = 12,
  from = new Date(),
): CapacityPlan {
  const monday = startOfWeek(from);
  const buckets: RecallEntry[][] = Array.from({ length: weeks }, () => []);

  for (const entry of entries) {
    const week = Math.max(0, Math.floor(entry.daysUntilDue / 7));
    if (week < weeks) {
      buckets[week].push(entry);
    }
  }

  const laidOut: Week[] = buckets.map((bucket, index) => ({
    index,
    startsOn: addDays(monday, index * 7),
    entries: bucket,
    hours: Number(hoursOf(bucket).toFixed(2)),
    overdue: bucket.filter((entry) => entry.standing === 'OVERDUE').length,
  }));

  const overloaded = laidOut.filter((week) => week.hours > capacityHours);

  return {
    weeks: laidOut,
    capacityHours,
    totalHours: Number(laidOut.reduce((total, week) => total + week.hours, 0).toFixed(2)),
    overloadedWeeks: overloaded.length,
    worstWeek:
      laidOut.reduce<Week | null>(
        (worst, week) => (worst === null || week.hours > worst.hours ? week : worst),
        null,
      ) ?? null,
  };
}

export interface Suggestion {
  readonly entry: RecallEntry;
  readonly fromWeek: number;
  readonly toWeek: number;
  readonly hours: number;
}

/**
 * What to pull forward to bring every week inside capacity.
 *
 * <p>Greedy on purpose. The optimal packing is not worth having: the planner
 * is advisory, a person accepts or ignores each suggestion, and a schedule
 * nobody can follow the reasoning of gets ignored wholesale.
 */
export function levelling(current: CapacityPlan): readonly Suggestion[] {
  const load = current.weeks.map((week) => week.hours);
  const suggestions: Suggestion[] = [];

  for (let index = current.weeks.length - 1; index > 0; index--) {
    const week = current.weeks[index];
    // Least critical first: those are the ones a customer will not miss early.
    const movable = [...week.entries]
      .filter((entry) => entry.standing !== 'OVERDUE')
      .sort((a, b) => hoursFor(a) - hoursFor(b));

    for (const entry of movable) {
      if (load[index] <= current.capacityHours) {
        break;
      }
      const target = earliestRoom(load, index, current.capacityHours, hoursFor(entry));
      if (target === null) {
        continue;
      }
      load[index] -= hoursFor(entry);
      load[target] += hoursFor(entry);
      suggestions.push({
        entry,
        fromWeek: index,
        toWeek: target,
        hours: hoursFor(entry),
      });
    }
  }

  return suggestions;
}

function earliestRoom(
  load: readonly number[],
  before: number,
  capacity: number,
  hours: number,
): number | null {
  for (let candidate = 0; candidate < before; candidate++) {
    if (load[candidate] + hours <= capacity) {
      return candidate;
    }
  }
  return null;
}

export function startOfWeek(from: Date): string {
  const date = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const day = date.getUTCDay();
  // Sunday counts as the end of the previous week, not the start of this one.
  const back = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** How full a week is, as a fraction, so a bar can be drawn from it. */
export function utilisation(week: Week, capacityHours: number): number {
  return capacityHours <= 0 ? 0 : week.hours / capacityHours;
}
