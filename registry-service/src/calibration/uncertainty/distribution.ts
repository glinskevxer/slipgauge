/**
 * How an uncertainty contribution is assumed to be spread. The divisor turns a
 * half width quoted in a data sheet into a standard uncertainty, which is the
 * only form the components can be combined in.
 */
export enum Distribution {
  /** Already a standard uncertainty, or a coverage factor of one. */
  NORMAL = 'NORMAL',
  /** Quantisation, resolution and unspecified maker limits. */
  RECTANGULAR = 'RECTANGULAR',
  /** Two rectangular effects convolved, such as a matched pair of readings. */
  TRIANGULAR = 'TRIANGULAR',
  /** Cyclic effects, most often mains hum or a rotating shaft. */
  U_SHAPED = 'U_SHAPED',
}

const DIVISORS: Readonly<Record<Distribution, number>> = {
  [Distribution.NORMAL]: 1,
  [Distribution.RECTANGULAR]: Math.sqrt(3),
  [Distribution.TRIANGULAR]: Math.sqrt(6),
  [Distribution.U_SHAPED]: Math.sqrt(2),
};

export function divisorOf(distribution: Distribution): number {
  const divisor = DIVISORS[distribution];

  if (divisor === undefined) {
    throw new Error(`no divisor is defined for the ${String(distribution)} distribution`);
  }
  return divisor;
}

/** Converts a quoted half width into a standard uncertainty. */
export function standardise(distribution: Distribution, halfWidth: number): number {
  return halfWidth / divisorOf(distribution);
}
