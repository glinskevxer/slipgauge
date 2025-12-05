import {
  addWorkingDays,
  calendarDaysBetween,
  isWeekend,
  nextWorkingDay,
  workingDaysBetween,
} from '@registry/jobs/working-days';

// 2025-11-14 is a Friday, 15th a Saturday, 16th a Sunday, 17th a Monday.
describe('telling a working day from a weekend', () => {
  it('knows the weekend', () => {
    expect(isWeekend('2025-11-14')).toBe(false);
    expect(isWeekend('2025-11-15')).toBe(true);
    expect(isWeekend('2025-11-16')).toBe(true);
    expect(isWeekend('2025-11-17')).toBe(false);
  });

  it('refuses something that is not a date at all', () => {
    expect(() => isWeekend('the fourteenth')).toThrow(RangeError);
  });
});

describe('finding the next working day', () => {
  it('leaves a working day where it is', () => {
    expect(nextWorkingDay('2025-11-14')).toBe('2025-11-14');
  });

  it('pushes a Saturday and a Sunday to the Monday', () => {
    expect(nextWorkingDay('2025-11-15')).toBe('2025-11-17');
    expect(nextWorkingDay('2025-11-16')).toBe('2025-11-17');
  });
});

describe('adding working days', () => {
  it('lands on the same day for a same day job', () => {
    expect(addWorkingDays('2025-11-14', 0)).toBe('2025-11-14');
  });

  it('lands on the Monday for a same day job that arrived on a Saturday', () => {
    expect(addWorkingDays('2025-11-15', 0)).toBe('2025-11-17');
  });

  it('steps over the weekend', () => {
    expect(addWorkingDays('2025-11-14', 1)).toBe('2025-11-17');
    expect(addWorkingDays('2025-11-13', 2)).toBe('2025-11-17');
  });

  it('counts ten working days as a fortnight', () => {
    expect(addWorkingDays('2025-11-17', 10)).toBe('2025-12-01');
  });

  it('carries over the end of a year', () => {
    expect(addWorkingDays('2025-12-29', 5)).toBe('2026-01-05');
  });

  it('refuses to count backwards', () => {
    expect(() => addWorkingDays('2025-11-17', -1)).toThrow(RangeError);
    expect(() => addWorkingDays('2025-11-17', 1.5)).toThrow(RangeError);
  });
});

describe('counting working days between two dates', () => {
  it('is nothing across a weekend', () => {
    expect(workingDaysBetween('2025-11-14', '2025-11-16')).toBe(0);
  });

  it('counts the Monday', () => {
    expect(workingDaysBetween('2025-11-14', '2025-11-17')).toBe(1);
  });

  it('counts a full week as five', () => {
    expect(workingDaysBetween('2025-11-17', '2025-11-24')).toBe(5);
  });

  it('is zero on the same day', () => {
    expect(workingDaysBetween('2025-11-17', '2025-11-17')).toBe(0);
  });

  it('goes negative when the second date is earlier', () => {
    expect(workingDaysBetween('2025-11-24', '2025-11-17')).toBe(-5);
  });

  it('agrees with itself in both directions', () => {
    const forward = workingDaysBetween('2025-11-03', '2025-12-19');
    const backward = workingDaysBetween('2025-12-19', '2025-11-03');

    expect(forward).toBe(34);
    expect(backward).toBe(-forward);
  });

  it('is the inverse of adding, for any whole number of working days', () => {
    for (const days of [0, 1, 3, 7, 12, 30]) {
      const landed = addWorkingDays('2025-11-17', days);
      expect(workingDaysBetween('2025-11-17', landed)).toBe(days);
    }
  });
});

describe('counting calendar days', () => {
  it('counts the weekend the working day count skips', () => {
    expect(calendarDaysBetween('2025-11-14', '2025-11-17')).toBe(3);
    expect(workingDaysBetween('2025-11-14', '2025-11-17')).toBe(1);
  });

  it('goes negative backwards', () => {
    expect(calendarDaysBetween('2025-11-17', '2025-11-14')).toBe(-3);
  });
});
