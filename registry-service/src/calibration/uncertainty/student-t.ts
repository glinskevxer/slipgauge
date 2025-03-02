/**
 * Two sided Student t values at ninety five and a bit percent, the table in
 * GUM annex G. Interpolating between tabulated rows is what the GUM itself
 * recommends, and it keeps the service free of a statistics dependency for the
 * sake of fourteen numbers.
 */
const DEGREES = [1, 2, 3, 4, 5, 6, 8, 10, 14, 20, 30, 50, 100, Number.POSITIVE_INFINITY];

const FACTORS = [13.97, 4.53, 3.31, 2.87, 2.65, 2.52, 2.37, 2.28, 2.2, 2.13, 2.09, 2.05, 2.025, 2];

/** The asymptotic factor, which is what a budget of pure specifications gets. */
export const COVERAGE_AT_INFINITY = FACTORS[FACTORS.length - 1] as number;

export function coverageFactorAt95(effectiveDegreesOfFreedom: number): number {
  if (Number.isNaN(effectiveDegreesOfFreedom)) {
    throw new Error('degrees of freedom came out as not a number');
  }
  if (effectiveDegreesOfFreedom <= (DEGREES[0] as number)) {
    return FACTORS[0] as number;
  }
  if (!Number.isFinite(effectiveDegreesOfFreedom)) {
    return COVERAGE_AT_INFINITY;
  }

  for (let i = 1; i < DEGREES.length; i++) {
    const upper = DEGREES[i] as number;

    if (effectiveDegreesOfFreedom <= upper) {
      if (!Number.isFinite(upper)) {
        return FACTORS[i] as number;
      }
      const lower = DEGREES[i - 1] as number;
      const fraction = (effectiveDegreesOfFreedom - lower) / (upper - lower);

      return (FACTORS[i - 1] as number) + fraction * ((FACTORS[i] as number) - (FACTORS[i - 1] as number));
    }
  }
  return COVERAGE_AT_INFINITY;
}
