/**
 * The laboratory works Monday to Friday. Everything the desk quotes is quoted
 * in working days, so the promise date has to be worked out by counting them
 * rather than by adding days and hoping the customer does not notice a Sunday.
 *
 * <p>Bank holidays are not here. They vary by site and the laboratory has one
 * site, so the desk moves the promise by hand on the three or four days a year
 * it matters, and the alternative is a holiday table nobody maintains.
 */
const MILLISECONDS_PER_DAY = 86_400_000;

function parse(iso: string): Date {
  const parsed = new Date(`${iso}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`${iso} is not a date`);
  }
  return parsed;
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Saturday or Sunday. */
export function isWeekend(iso: string): boolean {
  const day = parse(iso).getUTCDay();
  return day === 0 || day === 6;
}

/** The same day when it is a working day, otherwise the next Monday. */
export function nextWorkingDay(iso: string): string {
  const date = parse(iso);

  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return format(date);
}

/**
 * A number of working days after a date. Zero lands on the same day when that
 * is a working day, which is what a same day job means, and on the next
 * working day when the item came in over a weekend.
 */
export function addWorkingDays(iso: string, days: number): string {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError('working days are counted forwards in whole days');
  }
  const date = parse(nextWorkingDay(iso));
  let remaining = days;

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      remaining -= 1;
    }
  }
  return format(date);
}

/**
 * Working days between two dates, counting neither end. Negative when the
 * second date is earlier, which is what lets the desk read a promise that has
 * not fallen due yet as a negative lateness.
 */
export function workingDaysBetween(from: string, to: string): number {
  if (from === to) {
    return 0;
  }
  const backwards = to < from;
  const start = parse(backwards ? to : from);
  const end = parse(backwards ? from : to);

  let counted = 0;
  const cursor = new Date(start);

  while (cursor.getTime() < end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      counted += 1;
    }
  }
  return backwards ? -counted : counted;
}

/** Calendar days, for the places where the customer counts them that way. */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / MILLISECONDS_PER_DAY);
}
