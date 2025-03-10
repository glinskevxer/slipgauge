/**
 * What a measurement point, and by extension a certificate, was judged to be.
 *
 * <p>MARGINAL is not a softer failure. It means the reading sits inside the
 * tolerance but the measurement uncertainty straddles the limit, so the
 * laboratory cannot state conformity at its stated confidence. ILAC-G8 calls
 * this a conditional pass; the register treats it as a pass that shortens the
 * next interval rather than one that extends it.
 */
export enum Verdict {
  PASS = 'PASS',
  MARGINAL = 'MARGINAL',
  OUT_OF_TOLERANCE = 'OUT_OF_TOLERANCE',
  INDETERMINATE = 'INDETERMINATE',
  NOT_ASSESSED = 'NOT_ASSESSED',
}

const SEVERITY: Readonly<Record<Verdict, number>> = {
  [Verdict.PASS]: 0,
  [Verdict.NOT_ASSESSED]: 1,
  [Verdict.MARGINAL]: 2,
  [Verdict.INDETERMINATE]: 3,
  [Verdict.OUT_OF_TOLERANCE]: 4,
};

export function severityOf(verdict: Verdict): number {
  const severity = SEVERITY[verdict];

  if (severity === undefined) {
    throw new Error(`no severity is ranked for the verdict ${String(verdict)}`);
  }
  return severity;
}

/** True when the instrument may go back into service on this result. */
export function serviceable(verdict: Verdict): boolean {
  return verdict === Verdict.PASS || verdict === Verdict.MARGINAL;
}

/** True when the result is evidence the instrument had drifted out. */
export function failing(verdict: Verdict): boolean {
  return verdict === Verdict.OUT_OF_TOLERANCE;
}

/**
 * The worse of two verdicts. A certificate takes the worst of its points, and
 * an instrument takes the worst of its as found and as left states.
 */
export function worseOf(left: Verdict, right: Verdict): Verdict {
  return severityOf(left) >= severityOf(right) ? left : right;
}

/** The worst of a whole run of points. An empty run was not assessed. */
export function worstOf(verdicts: Iterable<Verdict>): Verdict {
  let worst: Verdict | null = null;

  for (const verdict of verdicts) {
    worst = worst === null ? verdict : worseOf(worst, verdict);
  }
  return worst ?? Verdict.NOT_ASSESSED;
}
