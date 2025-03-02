import { coverageFactorAt95 } from './student-t';
import { UncertaintyComponent } from './uncertainty-component';

/**
 * A full budget for one measurement point, combined the way the GUM sets out.
 *
 * <p>Components are combined by root sum square, the effective degrees of
 * freedom come from Welch-Satterthwaite, and the coverage factor is read off a
 * Student t table at ninety five percent rather than being fixed at two. That
 * distinction matters here: a budget dominated by a handful of repeat readings
 * needs a factor well above two, and using two anyway understates the interval
 * that the guard band is later cut from.
 */
export class UncertaintyBudget {
  private constructor(private readonly lines: readonly UncertaintyComponent[]) {}

  static of(...components: UncertaintyComponent[]): UncertaintyBudget {
    return new UncertaintyBudget([...components]);
  }

  static from(components: readonly UncertaintyComponent[]): UncertaintyBudget {
    return new UncertaintyBudget([...components]);
  }

  plus(component: UncertaintyComponent): UncertaintyBudget {
    return new UncertaintyBudget([...this.lines, component]);
  }

  components(): readonly UncertaintyComponent[] {
    return this.lines;
  }

  isEmpty(): boolean {
    return this.lines.length === 0;
  }

  /** The combined standard uncertainty, written uc in the GUM. */
  combinedStandard(): number {
    const variance = this.lines.reduce((total, line) => total + line.varianceContribution(), 0);
    return Math.sqrt(variance);
  }

  /**
   * Welch-Satterthwaite. A component with infinite degrees of freedom adds
   * nothing to the denominator, so a budget made only of specification limits
   * comes back as infinite and takes the asymptotic coverage factor.
   */
  effectiveDegreesOfFreedom(): number {
    const combined = this.combinedStandard();

    if (combined === 0) {
      return Number.POSITIVE_INFINITY;
    }

    let denominator = 0;
    for (const line of this.lines) {
      if (!Number.isFinite(line.degreesOfFreedom)) {
        continue;
      }
      const u = line.standardUncertainty();
      denominator += u ** 4 / line.degreesOfFreedom;
    }

    if (denominator === 0) {
      return Number.POSITIVE_INFINITY;
    }
    return combined ** 4 / denominator;
  }

  coverageFactor(): number {
    return coverageFactorAt95(this.effectiveDegreesOfFreedom());
  }

  /** The expanded uncertainty U at roughly ninety five percent confidence. */
  expanded(): number {
    return this.coverageFactor() * this.combinedStandard();
  }

  /** Expanded uncertainty at a caller supplied factor, for legacy certificates. */
  expandedAt(coverageFactor: number): number {
    if (!(coverageFactor > 0)) {
      throw new Error('a coverage factor must be positive');
    }
    return coverageFactor * this.combinedStandard();
  }

  /**
   * Components ordered by how much of the variance they own, largest first.
   * This is what the console shows when a technician asks why a budget is as
   * wide as it is.
   */
  dominantFirst(): readonly UncertaintyComponent[] {
    return [...this.lines].sort(
      (left, right) => right.varianceContribution() - left.varianceContribution(),
    );
  }

  /**
   * The share of the variance each line owns, keyed by label. Two lines with
   * the same label are summed, which is what a budget sheet does when the same
   * effect is entered twice at different points.
   */
  varianceShares(): Map<string, number> {
    const total = this.lines.reduce((sum, line) => sum + line.varianceContribution(), 0);
    const shares = new Map<string, number>();

    if (total === 0) {
      return shares;
    }
    for (const line of this.lines) {
      const share = line.varianceContribution() / total;
      shares.set(line.label, (shares.get(line.label) ?? 0) + share);
    }
    return shares;
  }
}
