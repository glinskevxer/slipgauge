import { Injectable } from '@nestjs/common';

/**
 * Every due date, recall window and interval decision reads the clock through
 * this. Nothing in the domain calls Date.now directly, which is what makes the
 * scheduling rules testable at a fixed date.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  /** Today as an ISO date, which is the form every stored date takes. */
  today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  /** An ISO date a number of days from today, negative to go backwards. */
  daysFromToday(days: number): string {
    const date = this.now();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
}

/**
 * A clock pinned to one instant. Only ever provided by a test, which is why it
 * lives beside the real one rather than in the test tree: a fake that drifts
 * from the thing it replaces is worse than no fake.
 */
export class FixedClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.instant);
  }
}
