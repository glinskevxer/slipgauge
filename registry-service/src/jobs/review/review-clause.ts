/**
 * The four questions ISO/IEC 17025 clause 7.1.1 makes the laboratory answer
 * before it takes work on, kept as data rather than as four booleans scattered
 * through a service.
 *
 * <p>They are not independent. Capability is judged against the requirements,
 * the method is judged against the capability, and the decision rule only means
 * anything once the method is fixed. That is why the review evaluates them in
 * order and stops describing later clauses once an earlier one has failed: a
 * report that says the method is wrong when nobody wrote down what was wanted
 * sends the reviewer chasing the wrong thing.
 */
export enum ReviewClause {
  /** 7.1.1 a) the requirements are defined, documented and understood. */
  REQUIREMENTS = 'REQUIREMENTS',
  /** 7.1.1 b) the laboratory has the capability and the resources. */
  CAPABILITY = 'CAPABILITY',
  /** 7.1.1 c) an appropriate method has been selected. */
  METHOD = 'METHOD',
  /** 7.1.3 the decision rule has been agreed with the customer. */
  DECISION_RULE = 'DECISION_RULE',
}

/** The order they are answered in, which is also the order they depend on. */
export const CLAUSE_ORDER: readonly ReviewClause[] = [
  ReviewClause.REQUIREMENTS,
  ReviewClause.CAPABILITY,
  ReviewClause.METHOD,
  ReviewClause.DECISION_RULE,
];

export enum ReviewOutcome {
  ACCEPTED = 'ACCEPTED',
  /** Taken on with something written down that the customer has agreed to. */
  ACCEPTED_WITH_DEVIATION = 'ACCEPTED_WITH_DEVIATION',
  DECLINED = 'DECLINED',
}

/** How badly a clause failed, which is what decides whether it can be waived. */
export enum FindingSeverity {
  /** Worth writing down, does not stop the job. */
  NOTE = 'NOTE',
  /** Stops an accreditation, can be deviated against with the customer. */
  DEVIATION = 'DEVIATION',
  /** Nothing the customer can agree to makes this job possible. */
  BLOCKING = 'BLOCKING',
}

export interface ReviewFinding {
  readonly clause: ReviewClause;
  readonly severity: FindingSeverity;
  /** The job line it came from, or null when it is about the job as a whole. */
  readonly lineNumber: number | null;
  readonly detail: string;
}

export function finding(
  clause: ReviewClause,
  severity: FindingSeverity,
  detail: string,
  lineNumber: number | null = null,
): ReviewFinding {
  return { clause, severity, lineNumber, detail };
}

const RANK: Readonly<Record<FindingSeverity, number>> = {
  [FindingSeverity.NOTE]: 0,
  [FindingSeverity.DEVIATION]: 1,
  [FindingSeverity.BLOCKING]: 2,
};

export function worstSeverity(findings: readonly ReviewFinding[]): FindingSeverity | null {
  let worst: FindingSeverity | null = null;

  for (const item of findings) {
    if (worst === null || RANK[item.severity] > RANK[worst]) {
      worst = item.severity;
    }
  }
  return worst;
}

/**
 * The outcome the findings force. A reviewer can be stricter than this and
 * decline a job the rules would have let through, but never more lenient.
 */
export function outcomeFor(findings: readonly ReviewFinding[]): ReviewOutcome {
  switch (worstSeverity(findings)) {
    case FindingSeverity.BLOCKING:
      return ReviewOutcome.DECLINED;
    case FindingSeverity.DEVIATION:
      return ReviewOutcome.ACCEPTED_WITH_DEVIATION;
    default:
      return ReviewOutcome.ACCEPTED;
  }
}

/** A clause passes when nothing worse than a note was raised against it. */
export function clausePasses(
  clause: ReviewClause,
  findings: readonly ReviewFinding[],
): boolean {
  return !findings.some(
    (item) => item.clause === clause && item.severity !== FindingSeverity.NOTE,
  );
}

/**
 * The first clause that failed, which is the only one worth reporting in full.
 * Everything after it was judged against an answer that is not settled.
 */
export function firstFailedClause(findings: readonly ReviewFinding[]): ReviewClause | null {
  return CLAUSE_ORDER.find((clause) => !clausePasses(clause, findings)) ?? null;
}

/**
 * Trims the findings down to the ones the reviewer should act on now: every
 * finding up to and including the first clause that failed. Notes on later
 * clauses are kept, because they cost nothing and are often the reason the
 * earlier clause failed in the first place.
 */
export function actionable(findings: readonly ReviewFinding[]): readonly ReviewFinding[] {
  const failed = firstFailedClause(findings);

  if (failed === null) {
    return findings;
  }
  const cutoff = CLAUSE_ORDER.indexOf(failed);

  return findings.filter((item) => {
    const position = CLAUSE_ORDER.indexOf(item.clause);
    return position <= cutoff || item.severity === FindingSeverity.NOTE;
  });
}

/** How a finding reads on the review sheet. */
export function describeFinding(item: ReviewFinding): string {
  const where = item.lineNumber === null ? 'job' : `line ${item.lineNumber}`;
  return `${where}: ${item.detail}`;
}
