/**
 * What an authorisation lets somebody do at the bench.
 *
 * <p>The three are ordered and the order is the whole point: an approver can do
 * everything an authorised technician can, and a trainee can do neither of the
 * things that end up on a certificate. Comparing them anywhere else in the
 * codebase goes through here, because a comparison written as a string test
 * gets it wrong the first time somebody adds a fourth level.
 */
export enum CompetenceLevel {
  /** Works under supervision. Nothing they record is signed off by them. */
  TRAINEE = 'TRAINEE',
  /** Performs and records calibrations in their own name. */
  AUTHORISED = 'AUTHORISED',
  /** Approves a certificate somebody else performed. */
  APPROVER = 'APPROVER',
}

const RANK: Readonly<Record<CompetenceLevel, number>> = {
  [CompetenceLevel.TRAINEE]: 0,
  [CompetenceLevel.AUTHORISED]: 1,
  [CompetenceLevel.APPROVER]: 2,
};

export function rankOf(level: CompetenceLevel): number {
  return RANK[level] ?? -1;
}

/** True when holding `held` is enough to do something that needs `needed`. */
export function levelReaches(held: CompetenceLevel, needed: CompetenceLevel): boolean {
  return rankOf(held) >= rankOf(needed);
}

export function highestLevel(levels: readonly CompetenceLevel[]): CompetenceLevel | null {
  let best: CompetenceLevel | null = null;

  for (const level of levels) {
    if (best === null || rankOf(level) > rankOf(best)) {
      best = level;
    }
  }
  return best;
}

/** What the level is called on the competence matrix. */
export function levelLabel(level: CompetenceLevel): string {
  switch (level) {
    case CompetenceLevel.TRAINEE:
      return 'under supervision';
    case CompetenceLevel.AUTHORISED:
      return 'authorised';
    case CompetenceLevel.APPROVER:
      return 'authorised to approve';
    default:
      return level;
  }
}
