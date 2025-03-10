import { toScale } from '../../common/numeric';

/**
 * Everything in the register is stored in numeric(18,9), so a limit is only
 * ever meaningful to nine decimal places. Rounding to that before comparing
 * keeps a computed guard band from putting a reading a billionth outside a
 * limit it is really sitting exactly on.
 */
export const LIMIT_SCALE = 9;

/**
 * The permitted window around one nominal value. Bands are symmetric in every
 * profile the laboratory currently holds, but they are stored as two limits so
 * an asymmetric specification does not need a schema change later.
 */
export class ToleranceBand {
  readonly nominal: number;
  readonly low: number;
  readonly high: number;

  constructor(nominal: number, low: number, high: number) {
    const roundedLow = toScale(low, LIMIT_SCALE);
    const roundedHigh = toScale(high, LIMIT_SCALE);

    if (roundedLow > roundedHigh) {
      throw new Error(`tolerance low ${roundedLow} sits above high ${roundedHigh}`);
    }
    this.nominal = toScale(nominal, LIMIT_SCALE);
    this.low = roundedLow;
    this.high = roundedHigh;
    Object.freeze(this);
  }

  static symmetric(nominal: number, halfWidth: number): ToleranceBand {
    if (halfWidth < 0) {
      throw new Error('a tolerance half width cannot be negative');
    }
    return new ToleranceBand(nominal, nominal - halfWidth, nominal + halfWidth);
  }

  halfWidth(): number {
    return toScale((this.high - this.low) / 2, LIMIT_SCALE);
  }

  width(): number {
    return toScale(this.high - this.low, LIMIT_SCALE);
  }

  contains(measured: number): boolean {
    const rounded = toScale(measured, LIMIT_SCALE);
    return rounded >= this.low && rounded <= this.high;
  }

  /**
   * How far outside the band a reading fell, zero when it is inside. Used by
   * the impact report to rank failures rather than to decide them.
   */
  excursion(measured: number): number {
    const rounded = toScale(measured, LIMIT_SCALE);

    if (rounded < this.low) {
      return toScale(this.low - rounded, LIMIT_SCALE);
    }
    if (rounded > this.high) {
      return toScale(rounded - this.high, LIMIT_SCALE);
    }
    return 0;
  }

  /** The band pulled in on both sides, which is what guard banding produces. */
  shrunkBy(amount: number): ToleranceBand {
    if (amount < 0) {
      throw new Error('a guard band cannot widen the tolerance');
    }
    const newLow = toScale(this.low + amount, LIMIT_SCALE);
    const newHigh = toScale(this.high - amount, LIMIT_SCALE);

    if (newLow > newHigh) {
      const middle = toScale(this.low + this.halfWidth(), LIMIT_SCALE);
      return new ToleranceBand(this.nominal, middle, middle);
    }
    return new ToleranceBand(this.nominal, newLow, newHigh);
  }

  /** True when the band has collapsed to a single value. */
  isPoint(): boolean {
    return this.low === this.high;
  }
}
