import { Distribution, standardise } from './distribution';

/** One line of an uncertainty budget, as it appears on the budget sheet. */
export class UncertaintyComponent {
  /**
   * @param label what the technician calls it on the budget sheet
   * @param source where the number came from, a certificate or a specification
   * @param distribution the assumed shape of the contribution
   * @param halfWidth the quantity as quoted, before the divisor
   * @param sensitivity partial derivative turning it into output units
   * @param degreesOfFreedom how well known it is, infinite for a specification
   */
  constructor(
    readonly label: string,
    readonly source: string,
    readonly distribution: Distribution,
    readonly halfWidth: number,
    readonly sensitivity: number,
    readonly degreesOfFreedom: number,
  ) {
    if (!Number.isFinite(halfWidth) || halfWidth < 0) {
      throw new Error(`component ${label} has a negative half width`);
    }
    if (Number.isNaN(degreesOfFreedom) || degreesOfFreedom <= 0) {
      throw new Error(`component ${label} needs positive degrees of freedom`);
    }
    Object.freeze(this);
  }

  /** A contribution read off a specification or a certificate. */
  static typeB(
    label: string,
    source: string,
    distribution: Distribution,
    halfWidth: number,
  ): UncertaintyComponent {
    return new UncertaintyComponent(
      label,
      source,
      distribution,
      halfWidth,
      1,
      Number.POSITIVE_INFINITY,
    );
  }

  /** A contribution evaluated from a run of repeat observations. */
  static typeA(
    label: string,
    standardDeviation: number,
    observations: number,
  ): UncertaintyComponent {
    if (observations < 2) {
      throw new Error('a type A evaluation needs at least two observations');
    }
    return new UncertaintyComponent(
      label,
      'repeat observations',
      Distribution.NORMAL,
      standardDeviation / Math.sqrt(observations),
      1,
      observations - 1,
    );
  }

  /** The contribution in output units, ready to be combined by root sum square. */
  standardUncertainty(): number {
    return standardise(this.distribution, this.halfWidth) * Math.abs(this.sensitivity);
  }

  /** The share of the combined variance this component is responsible for. */
  varianceContribution(): number {
    const u = this.standardUncertainty();
    return u * u;
  }

  /** The same line scaled by a sensitivity coefficient, leaving this one alone. */
  withSensitivity(sensitivity: number): UncertaintyComponent {
    return new UncertaintyComponent(
      this.label,
      this.source,
      this.distribution,
      this.halfWidth,
      sensitivity,
      this.degreesOfFreedom,
    );
  }
}
