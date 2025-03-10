/**
 * How much of the measurement uncertainty the laboratory takes on itself when
 * it states conformity. The choice is commercial as much as technical, so it
 * is recorded on the certificate rather than compiled in.
 */
export enum AcceptancePolicy {
  /**
   * Simple acceptance. The customer carries the risk that a reading right on
   * the limit was really outside it. Only defensible at a healthy ratio.
   */
  SHARED_RISK = 'SHARED_RISK',

  /**
   * The acceptance limit is pulled in by the whole expanded uncertainty, so a
   * pass means the true value is inside tolerance at the stated confidence.
   */
  STRINGENT = 'STRINGENT',

  /**
   * The guard band grows as the ratio worsens and disappears once the ratio
   * reaches the target. This is what the laboratory quotes by default.
   */
  MANAGED_RISK = 'MANAGED_RISK',
}

export enum ToleranceKind {
  /** A fixed width in the measured unit, independent of where you are. */
  ABSOLUTE = 'ABSOLUTE',
  /** A width proportional to the reading itself. */
  PERCENT_OF_READING = 'PERCENT_OF_READING',
  /** A width proportional to the instrument's full span. */
  PERCENT_OF_SPAN = 'PERCENT_OF_SPAN',
  /** Every term above summed together, which is how most makers state it. */
  COMBINED = 'COMBINED',
}
