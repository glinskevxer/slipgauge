import { Criticality } from '@core/models/instrument.model';
import { RecallStanding } from '@core/models/recall.model';
import { recallEntry } from '@fixtures';
import {
  addDays,
  hoursFor,
  hoursOf,
  levelling,
  plan,
  startOfWeek,
  utilisation,
} from '@features/capacity/capacity.model';

/**
 * Built in local time on purpose. The planner works in the laboratory's own
 * week, so a date written as UTC lands on the wrong side of midnight for
 * anyone east of Greenwich.
 */
const FRIDAY = new Date(2026, 0, 9, 10, 0);

describe('week arithmetic', () => {
  it('walks back to the monday of the week', () => {
    expect(startOfWeek(new Date(2026, 0, 9, 10, 0))).toBe('2026-01-05');
    expect(startOfWeek(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  it('treats sunday as the end of the week it closes', () => {
    expect(startOfWeek(new Date(2026, 0, 11, 23, 0))).toBe('2026-01-05');
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-01-28', 7)).toBe('2026-02-04');
  });
});

describe('bench hours', () => {
  it('costs a critical instrument far more than a routine one', () => {
    expect(hoursFor(recallEntry(`SG-${1}`, 0, 'SCHEDULED', { criticality: 'ROUTINE' as Criticality }))).toBe(0.75);
    expect(hoursFor(recallEntry(`SG-${1}`, 0, 'SCHEDULED', { criticality: 'IMPORTANT' as Criticality }))).toBe(1.5);
    expect(hoursFor(recallEntry(`SG-${1}`, 0, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality }))).toBe(3.5);
  });

  it('adds up a list', () => {
    expect(
      hoursOf([recallEntry(`SG-${1}`, 0, 'SCHEDULED', { criticality: 'ROUTINE' as Criticality }), recallEntry(`SG-${2}`, 0, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality }), recallEntry(`SG-${3}`, 0, 'SCHEDULED', { criticality: 'IMPORTANT' as Criticality })]),
    ).toBe(5.75);
  });
});

describe('planning the weeks', () => {
  it('makes as many weeks as asked for, even empty ones', () => {
    expect(plan([], 20, 12, FRIDAY).weeks).toHaveLength(12);
  });

  it('starts on the monday of the current week', () => {
    expect(plan([], 20, 4, FRIDAY).weeks[0].startsOn).toBe('2026-01-05');
    expect(plan([], 20, 4, FRIDAY).weeks[1].startsOn).toBe('2026-01-12');
  });

  it('buckets by whole weeks from now', () => {
    const built = plan(
      [recallEntry(`SG-1`, 0, 'SCHEDULED'), recallEntry(`SG-2`, 6, 'SCHEDULED'), recallEntry(`SG-3`, 7, 'SCHEDULED'), recallEntry(`SG-4`, 20, 'SCHEDULED')],
      20,
      12,
      FRIDAY,
    );

    expect(built.weeks[0].entries).toHaveLength(2);
    expect(built.weeks[1].entries).toHaveLength(1);
    expect(built.weeks[2].entries).toHaveLength(1);
  });

  it('puts overdue work in the first week', () => {
    const built = plan([recallEntry(`SG-1`, -40, 'OVERDUE' as RecallStanding, { criticality: 'ROUTINE' as Criticality })], 20, 12, FRIDAY);

    expect(built.weeks[0].entries).toHaveLength(1);
    expect(built.weeks[0].overdue).toBe(1);
  });

  it('leaves anything past the horizon out', () => {
    const built = plan([recallEntry(`SG-1`, 400, 'SCHEDULED')], 20, 12, FRIDAY);

    expect(built.totalHours).toBe(0);
  });

  it('counts the weeks that are over capacity', () => {
    const built = plan(
      [recallEntry(`SG-${1}`, 0, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality }), recallEntry(`SG-${2}`, 0, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality }), recallEntry(`SG-${3}`, 14, 'SCHEDULED', { criticality: 'ROUTINE' as Criticality })],
      5,
      12,
      FRIDAY,
    );

    expect(built.overloadedWeeks).toBe(1);
    expect(built.worstWeek?.index).toBe(0);
  });

  it('reports utilisation as a fraction of capacity', () => {
    const built = plan([recallEntry(`SG-${1}`, 0, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality })], 7, 12, FRIDAY);

    expect(utilisation(built.weeks[0], 7)).toBeCloseTo(0.5, 6);
    expect(utilisation(built.weeks[0], 0)).toBe(0);
  });
});

describe('levelling the load', () => {
  it('suggests nothing when every week already fits', () => {
    const built = plan([recallEntry(`SG-1`, 0, 'SCHEDULED'), recallEntry(`SG-2`, 8, 'SCHEDULED')], 20, 12, FRIDAY);

    expect(levelling(built)).toEqual([]);
  });

  it('pulls work forward into a week with room', () => {
    const built = plan(
      [recallEntry(`SG-${1}`, 21, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality }), recallEntry(`SG-${2}`, 21, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality }), recallEntry(`SG-${3}`, 21, 'SCHEDULED', { criticality: 'ROUTINE' as Criticality })],
      4,
      12,
      FRIDAY,
    );

    const suggestions = levelling(built);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((suggestion) => suggestion.toWeek < suggestion.fromWeek)).toBe(true);
  });

  it('never pushes work later than it is due', () => {
    const built = plan(
      Array.from({ length: 6 }, (_, index) => recallEntry(`SG-${index}`, 7, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality })),
      4,
      12,
      FRIDAY,
    );

    expect(levelling(built).every((suggestion) => suggestion.toWeek < suggestion.fromWeek)).toBe(
      true,
    );
  });

  it('leaves overdue work where it is rather than moving it again', () => {
    const built = plan(
      [
        recallEntry(`SG-1`, -3, 'OVERDUE' as RecallStanding, { criticality: 'CRITICAL' as Criticality }),
        recallEntry(`SG-2`, -4, 'OVERDUE' as RecallStanding, { criticality: 'CRITICAL' as Criticality }),
        recallEntry(`SG-3`, -5, 'OVERDUE' as RecallStanding, { criticality: 'CRITICAL' as Criticality }),
      ],
      3,
      12,
      FRIDAY,
    );

    expect(levelling(built)).toEqual([]);
  });

  it('moves the cheapest work first, because it is the least missed early', () => {
    const built = plan(
      [recallEntry(`SG-${1}`, 14, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality }), recallEntry(`SG-${2}`, 14, 'SCHEDULED', { criticality: 'ROUTINE' as Criticality }), recallEntry(`SG-${3}`, 14, 'SCHEDULED', { criticality: 'IMPORTANT' as Criticality })],
      4,
      12,
      FRIDAY,
    );

    expect(levelling(built)[0].entry.criticality).toBe('ROUTINE');
  });

  it('gives up rather than inventing room that does not exist', () => {
    const built = plan(
      Array.from({ length: 10 }, (_, index) => recallEntry(`SG-${index}`, 14, 'SCHEDULED', { criticality: 'CRITICAL' as Criticality })),
      1,
      12,
      FRIDAY,
    );

    expect(levelling(built)).toEqual([]);
  });
});
