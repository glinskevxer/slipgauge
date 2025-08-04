/**
 * The GUM maths, in the console.
 *
 * <p>The service is the authority on what an uncertainty is once a certificate
 * is filed, and it recomputes everything it is sent. This exists because the
 * technician needs the number before filing: the budget is built at the bench,
 * and finding out that the ratio was under one after the sheet has gone in
 * means the whole visit is repeated.
 *
 * <p>Kept deliberately identical in behaviour to UncertaintyBudget on the
 * service side, including the Student t table, so the two never disagree.
 */

export type Distribution = 'NORMAL' | 'RECTANGULAR' | 'TRIANGULAR' | 'U_SHAPED';

export interface Component {
  readonly key: string;
  label: string;
  source: string;
  distribution: Distribution;
  halfWidth: number | null;
  sensitivity: number | null;
  /** Null means a specification, which carries infinite degrees of freedom. */
  observations: number | null;
}

const DIVISORS: Readonly<Record<Distribution, number>> = {
  NORMAL: 1,
  RECTANGULAR: Math.sqrt(3),
  TRIANGULAR: Math.sqrt(6),
  U_SHAPED: Math.sqrt(2),
};

const DISTRIBUTION_LABELS: Readonly<Record<Distribution, string>> = {
  NORMAL: 'Normal, already standard',
  RECTANGULAR: 'Rectangular, a stated limit',
  TRIANGULAR: 'Triangular',
  U_SHAPED: 'U shaped, a cyclic effect',
};

const DEGREES = [1, 2, 3, 4, 5, 6, 8, 10, 14, 20, 30, 50, 100, Number.POSITIVE_INFINITY];
const FACTORS = [13.97, 4.53, 3.31, 2.87, 2.65, 2.52, 2.37, 2.28, 2.2, 2.13, 2.09, 2.05, 2.025, 2];

let sequence = 0;

export function emptyComponent(label = ''): Component {
  sequence += 1;
  return {
    key: `u-${sequence}`,
    label,
    source: '',
    distribution: 'RECTANGULAR',
    halfWidth: null,
    sensitivity: 1,
    observations: null,
  };
}

export function distributionLabel(distribution: Distribution): string {
  return DISTRIBUTION_LABELS[distribution];
}

export function divisorFor(distribution: Distribution): number {
  return DIVISORS[distribution];
}

/** The contribution in output units, ready to be combined by root sum square. */
export function standardUncertainty(component: Component): number {
  if (component.halfWidth === null || component.halfWidth < 0) {
    return 0;
  }
  const sensitivity = component.sensitivity ?? 1;
  const divisor =
    component.observations !== null && component.observations > 1
      ? Math.sqrt(component.observations)
      : DIVISORS[component.distribution];
  return (component.halfWidth / divisor) * Math.abs(sensitivity);
}

export function degreesOfFreedom(component: Component): number {
  if (component.observations === null || component.observations < 2) {
    return Number.POSITIVE_INFINITY;
  }
  return component.observations - 1;
}

export function combinedStandard(components: readonly Component[]): number {
  const variance = components.reduce((total, component) => {
    const u = standardUncertainty(component);
    return total + u * u;
  }, 0);
  return Math.sqrt(variance);
}

/** Welch-Satterthwaite. Infinite when nothing was evaluated from observations. */
export function effectiveDegreesOfFreedom(components: readonly Component[]): number {
  const combined = combinedStandard(components);
  if (combined === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let denominator = 0;
  for (const component of components) {
    const freedom = degreesOfFreedom(component);
    if (!Number.isFinite(freedom)) {
      continue;
    }
    const u = standardUncertainty(component);
    denominator += Math.pow(u, 4) / freedom;
  }
  return denominator === 0 ? Number.POSITIVE_INFINITY : Math.pow(combined, 4) / denominator;
}

export function coverageFactor(components: readonly Component[]): number {
  return studentT(effectiveDegreesOfFreedom(components));
}

export function expanded(components: readonly Component[]): number {
  return coverageFactor(components) * combinedStandard(components);
}

export function studentT(freedom: number): number {
  if (Number.isNaN(freedom)) {
    return FACTORS[FACTORS.length - 1];
  }
  if (freedom <= DEGREES[0]) {
    return FACTORS[0];
  }
  if (!Number.isFinite(freedom)) {
    return FACTORS[FACTORS.length - 1];
  }
  for (let i = 1; i < DEGREES.length; i++) {
    if (freedom <= DEGREES[i]) {
      if (!Number.isFinite(DEGREES[i])) {
        return FACTORS[i];
      }
      const fraction = (freedom - DEGREES[i - 1]) / (DEGREES[i] - DEGREES[i - 1]);
      return FACTORS[i - 1] + fraction * (FACTORS[i] - FACTORS[i - 1]);
    }
  }
  return FACTORS[FACTORS.length - 1];
}

export interface Contribution {
  readonly component: Component;
  readonly standard: number;
  readonly share: number;
}

/** Components ordered by how much of the variance each owns, largest first. */
export function contributions(components: readonly Component[]): readonly Contribution[] {
  const combined = combinedStandard(components);
  const variance = combined * combined;
  return components
    .map((component) => {
      const standard = standardUncertainty(component);
      return {
        component,
        standard,
        share: variance === 0 ? 0 : (standard * standard) / variance,
      };
    })
    .sort((a, b) => b.share - a.share);
}

/** Tolerance half width over expanded uncertainty, the number that decides the guard band. */
export function testUncertaintyRatio(
  components: readonly Component[],
  toleranceHalfWidth: number | null,
): number | null {
  if (toleranceHalfWidth === null || toleranceHalfWidth <= 0) {
    return null;
  }
  const u = expanded(components);
  return u === 0 ? Number.POSITIVE_INFINITY : toleranceHalfWidth / u;
}

export type RatioVerdict = 'healthy' | 'guarded' | 'unstatable';

export function ratioVerdict(ratio: number | null): RatioVerdict | null {
  if (ratio === null) {
    return null;
  }
  if (ratio < 1) {
    return 'unstatable';
  }
  return ratio >= 4 ? 'healthy' : 'guarded';
}

/** What the acceptance limits would be pulled in by under the managed policy. */
export function managedGuardBand(
  components: readonly Component[],
  toleranceHalfWidth: number | null,
): number {
  const ratio = testUncertaintyRatio(components, toleranceHalfWidth);
  if (ratio === null || !Number.isFinite(ratio) || ratio >= 4) {
    return 0;
  }
  return expanded(components) * Math.min(1, Math.max(0, 1 - ratio / 4));
}
