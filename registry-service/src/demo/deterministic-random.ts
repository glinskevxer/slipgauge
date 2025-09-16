/**
 * A small deterministic generator, so two people running the demo see the same
 * laboratory. Node has no seedable random of its own, and pulling a package in
 * for thirty lines of arithmetic is not a trade worth making.
 *
 * <p>This is mulberry32. It is not fit for anything but making a demo
 * repeatable, which is the only thing it is used for.
 */
export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;

    let value = this.state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** A whole number in [0, bound). */
  nextInt(bound: number): number {
    if (!Number.isInteger(bound) || bound < 1) {
      throw new Error(`a bound has to be a positive whole number, got ${bound}`);
    }
    return Math.floor(this.next() * bound);
  }

  /** One of the entries, chosen the same way every run. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('nothing to pick from');
    }
    return items[this.nextInt(items.length)] as T;
  }
}

/** Adds days to an ISO date. Dates are ISO strings everywhere in this service. */
export function plusDays(from: string, days: number): string {
  const date = new Date(`${from}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Adds whole years, which is how the demo history is laid out. */
export function plusYears(from: string, years: number): string {
  const date = new Date(`${from}T00:00:00Z`);

  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}
