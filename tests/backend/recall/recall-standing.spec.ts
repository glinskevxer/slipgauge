import {
  RecallEntry,
  RecallStanding,
  countByStanding,
  daysBetween,
  emptyCounts,
  needsChasing,
  standingOf,
} from '@registry/recall/recall-standing';

const TODAY = '2025-06-10';

function entry(standing: RecallStanding): RecallEntry {
  return { standing } as RecallEntry;
}

describe('where an instrument stands against its due date', () => {
  it('counts the days between two dates in the direction they are given', () => {
    expect(daysBetween('2025-06-10', '2025-06-17')).toBe(7);
    expect(daysBetween('2025-06-17', '2025-06-10')).toBe(-7);
    expect(daysBetween('2025-06-10', '2025-06-10')).toBe(0);
  });

  it('counts across a month and a year boundary correctly', () => {
    expect(daysBetween('2025-01-31', '2025-02-01')).toBe(1);
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('calls anything already past its date overdue', () => {
    expect(standingOf('2025-06-09', TODAY)).toBe(RecallStanding.OVERDUE);
    expect(standingOf('2020-01-01', TODAY)).toBe(RecallStanding.OVERDUE);
  });

  it('puts today itself in the week band rather than in overdue', () => {
    expect(standingOf(TODAY, TODAY)).toBe(RecallStanding.DUE_THIS_WEEK);
  });

  it('holds the week band open for a full seven days', () => {
    expect(standingOf('2025-06-17', TODAY)).toBe(RecallStanding.DUE_THIS_WEEK);
    expect(standingOf('2025-06-18', TODAY)).toBe(RecallStanding.DUE_THIS_MONTH);
  });

  it('holds the month band open for thirty one days', () => {
    expect(standingOf('2025-07-11', TODAY)).toBe(RecallStanding.DUE_THIS_MONTH);
    expect(standingOf('2025-07-12', TODAY)).toBe(RecallStanding.SCHEDULED);
  });

  it('reports an instrument with no date at all as unscheduled', () => {
    expect(standingOf(null, TODAY)).toBe(RecallStanding.NOT_SCHEDULED);
  });

  it('chases what is overdue or due this week and nothing else', () => {
    expect(needsChasing(RecallStanding.OVERDUE)).toBe(true);
    expect(needsChasing(RecallStanding.DUE_THIS_WEEK)).toBe(true);
    expect(needsChasing(RecallStanding.DUE_THIS_MONTH)).toBe(false);
    expect(needsChasing(RecallStanding.SCHEDULED)).toBe(false);
    expect(needsChasing(RecallStanding.NOT_SCHEDULED)).toBe(false);
  });

  it('starts a summary with every band present at zero', () => {
    const counts = emptyCounts();

    expect(Object.keys(counts)).toHaveLength(5);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
  });

  it('counts a board into its bands without dropping the empty ones', () => {
    const counts = countByStanding([
      entry(RecallStanding.OVERDUE),
      entry(RecallStanding.OVERDUE),
      entry(RecallStanding.SCHEDULED),
    ]);

    expect(counts[RecallStanding.OVERDUE]).toBe(2);
    expect(counts[RecallStanding.SCHEDULED]).toBe(1);
    expect(counts[RecallStanding.DUE_THIS_WEEK]).toBe(0);
  });
});
