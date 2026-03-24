/**
 * Scoring an interlaboratory comparison.
 *
 * <p>Clause 7.7.2 makes the laboratory take part in proficiency testing where
 * it is available, and the point of taking part is the score. Two schemes are
 * in use here and they answer different questions, which is why both are
 * computed rather than one being picked as the house standard.
 *
 * <p>The En number asks whether our result agrees with the reference value
 * given both stated uncertainties. It is the one that matters for a
 * calibration laboratory, because it judges the uncertainty claim as much as
 * the value. The z score asks how far out we are in units of the scheme's own
 * spread, which is the one the scheme organiser reports and the one a
 * management review meeting recognises.
 */

export enum ProficiencyOutcome {
  /** Inside the limit with room to spare. */
  SATISFACTORY = 'SATISFACTORY',
  /** Past the warning limit but not the action limit. */
  QUESTIONABLE = 'QUESTIONABLE',
  /** Past the action limit. Something is wrong and has to be found. */
  UNSATISFACTORY = 'UNSATISFACTORY',
  /** Not enough was reported to score it at all. */
  NOT_SCORED = 'NOT_SCORED',
}

/** What one participant reported against one assigned value. */
export interface ProficiencyResult {
  /** What we measured. */
  readonly reported: number;
  /** Our expanded uncertainty on it, at the same coverage as the scheme. */
  readonly reportedUncertainty: number | null;
  /** The value the scheme assigned. */
  readonly assigned: number;
  /** The scheme's own expanded uncertainty on the assigned value. */
  readonly assignedUncertainty: number | null;
  /** The spread the scheme scores z against, when it publishes one. */
  readonly standardDeviation: number | null;
}

/** The En limits are fixed by the scheme, and one is not a house choice. */
export const EN_ACTION_LIMIT = 1;
export const EN_WARNING_LIMIT = 0.7;

/** z limits are the conventional two and three. */
export const Z_WARNING_LIMIT = 2;
export const Z_ACTION_LIMIT = 3;

/**
 * The En number: the difference divided by the root sum square of both
 * uncertainties.
 *
 * <p>Null when either uncertainty is missing. A laboratory that did not report
 * an uncertainty cannot be scored on one, and substituting a zero would turn a
 * missing claim into a perfect one, which is the wrong direction to guess in.
 */
export function enNumber(result: ProficiencyResult): number | null {
  if (result.reportedUncertainty === null || result.assignedUncertainty === null) {
    return null;
  }
  const combined = Math.hypot(result.reportedUncertainty, result.assignedUncertainty);

  if (combined <= 0) {
    return null;
  }
  return (result.reported - result.assigned) / combined;
}

/** The z score: the difference in units of the scheme's own spread. */
export function zScore(result: ProficiencyResult): number | null {
  if (result.standardDeviation === null || result.standardDeviation <= 0) {
    return null;
  }
  return (result.reported - result.assigned) / result.standardDeviation;
}

/** The signed difference, which is what a trend across rounds is drawn from. */
export function deviation(result: ProficiencyResult): number {
  return result.reported - result.assigned;
}

function gradeAgainst(
  value: number | null,
  warning: number,
  action: number,
): ProficiencyOutcome {
  if (value === null || !Number.isFinite(value)) {
    return ProficiencyOutcome.NOT_SCORED;
  }
  const magnitude = Math.abs(value);

  if (magnitude > action) {
    return ProficiencyOutcome.UNSATISFACTORY;
  }
  return magnitude > warning ? ProficiencyOutcome.QUESTIONABLE : ProficiencyOutcome.SATISFACTORY;
}

export function gradeEn(en: number | null): ProficiencyOutcome {
  return gradeAgainst(en, EN_WARNING_LIMIT, EN_ACTION_LIMIT);
}

export function gradeZ(z: number | null): ProficiencyOutcome {
  return gradeAgainst(z, Z_WARNING_LIMIT, Z_ACTION_LIMIT);
}

const RANK: Readonly<Record<ProficiencyOutcome, number>> = {
  [ProficiencyOutcome.NOT_SCORED]: 0,
  [ProficiencyOutcome.SATISFACTORY]: 1,
  [ProficiencyOutcome.QUESTIONABLE]: 2,
  [ProficiencyOutcome.UNSATISFACTORY]: 3,
};

/**
 * The outcome of record, across both scores.
 *
 * <p>The worse of the two wins, and that is deliberate. A result that passes on
 * z and fails on En is a laboratory whose value is near enough but whose
 * uncertainty claim is too small, and that is exactly the failure a scheme
 * exists to find. Reporting the kinder of the two would hide it.
 *
 * <p>When neither can be computed the result is not scored, which is a real
 * answer and not a pass.
 */
export function overallOutcome(result: ProficiencyResult): ProficiencyOutcome {
  const en = gradeEn(enNumber(result));
  const z = gradeZ(zScore(result));

  if (en === ProficiencyOutcome.NOT_SCORED && z === ProficiencyOutcome.NOT_SCORED) {
    return ProficiencyOutcome.NOT_SCORED;
  }
  const graded = [en, z].filter((outcome) => outcome !== ProficiencyOutcome.NOT_SCORED);

  return graded.reduce((worst, outcome) => (RANK[outcome] > RANK[worst] ? outcome : worst));
}

/** True when the outcome has to raise a nonconformance on its own. */
export function raisesNonconformance(outcome: ProficiencyOutcome): boolean {
  return outcome === ProficiencyOutcome.UNSATISFACTORY;
}

/**
 * True when the result should suspend the authorisation of whoever performed
 * it until somebody has looked.
 *
 * <p>Only an unsatisfactory En does this. A poor z on a scheme with a tight
 * spread says the laboratory is at the edge of the pack; an En past one says
 * the result and its stated uncertainty do not contain the assigned value, and
 * that is a statement about the person and the method rather than the field.
 */
export function suspendsAuthorisation(result: ProficiencyResult): boolean {
  return gradeEn(enNumber(result)) === ProficiencyOutcome.UNSATISFACTORY;
}

/** How the outcome reads on the round sheet. */
export function outcomeLabel(outcome: ProficiencyOutcome): string {
  switch (outcome) {
    case ProficiencyOutcome.SATISFACTORY:
      return 'satisfactory';
    case ProficiencyOutcome.QUESTIONABLE:
      return 'questionable';
    case ProficiencyOutcome.UNSATISFACTORY:
      return 'unsatisfactory';
    default:
      return 'not scored';
  }
}

/**
 * A trend across rounds. Three consecutive results on the same side of the
 * assigned value is a bias rather than a run of luck, and a scheme that only
 * grades each round separately never says so.
 */
export function biasRun(results: readonly ProficiencyResult[]): number {
  let run = 0;
  let sign = 0;

  for (const result of results) {
    const difference = deviation(result);
    const thisSign = Math.sign(difference);

    if (thisSign === 0) {
      run = 0;
      sign = 0;
      continue;
    }
    if (thisSign === sign) {
      run += 1;
    } else {
      sign = thisSign;
      run = 1;
    }
  }
  return run;
}

export function showsBias(results: readonly ProficiencyResult[]): boolean {
  return biasRun(results) >= 3;
}
