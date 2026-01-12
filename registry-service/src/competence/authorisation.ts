import { CompetenceLevel, levelReaches, rankOf } from './competence-level';

/**
 * One authorisation, reduced to what the check reads. Kept as a plain shape so
 * the rule can be reasoned about without a database, which matters because this
 * is the rule that decides whether a certificate may exist.
 */
export interface Authorisation {
  readonly id: number;
  readonly person: string;
  readonly discipline: string;
  /** Null when the authorisation covers the whole discipline. */
  readonly classId: number | null;
  readonly level: CompetenceLevel;
  readonly rangeLow: number | null;
  readonly rangeHigh: number | null;
  readonly authorisedFrom: string;
  readonly authorisedTo: string | null;
  readonly withdrawn: boolean;
}

/** What the bench is asking permission for. */
export interface AuthorisationRequest {
  readonly person: string;
  readonly discipline: string;
  readonly classId: number;
  readonly level: CompetenceLevel;
  /** The furthest point on the scale the work reaches, when it matters. */
  readonly upTo: number | null;
  readonly on: string;
}

export enum RefusalReason {
  NOTHING_HELD = 'NOTHING_HELD',
  EXPIRED = 'EXPIRED',
  NOT_YET = 'NOT_YET',
  WITHDRAWN = 'WITHDRAWN',
  LEVEL_TOO_LOW = 'LEVEL_TOO_LOW',
  OUTSIDE_RANGE = 'OUTSIDE_RANGE',
}

export interface AuthorisationDecision {
  readonly allowed: boolean;
  readonly granted: Authorisation | null;
  readonly reason: RefusalReason | null;
  readonly detail: string;
}

/**
 * Whether one authorisation covers a request, ignoring every other one.
 *
 * <p>Order matters here and it is not arbitrary. Withdrawal is checked before
 * the dates because a withdrawn authorisation that has also expired should read
 * as withdrawn: "it ran out" sends the quality manager to renew something that
 * was taken away on purpose.
 */
export function coverage(
  held: Authorisation,
  request: AuthorisationRequest,
): RefusalReason | null {
  if (held.person !== request.person || held.discipline !== request.discipline) {
    return RefusalReason.NOTHING_HELD;
  }
  if (held.classId !== null && held.classId !== request.classId) {
    return RefusalReason.NOTHING_HELD;
  }
  if (held.withdrawn) {
    return RefusalReason.WITHDRAWN;
  }
  if (request.on < held.authorisedFrom) {
    return RefusalReason.NOT_YET;
  }
  if (held.authorisedTo !== null && request.on > held.authorisedTo) {
    return RefusalReason.EXPIRED;
  }
  if (!levelReaches(held.level, request.level)) {
    return RefusalReason.LEVEL_TOO_LOW;
  }
  if (request.upTo !== null && held.rangeHigh !== null && request.upTo > held.rangeHigh) {
    return RefusalReason.OUTSIDE_RANGE;
  }
  if (request.upTo !== null && held.rangeLow !== null && request.upTo < held.rangeLow) {
    return RefusalReason.OUTSIDE_RANGE;
  }
  return null;
}

/**
 * How specific an authorisation is. A class authorisation beats a discipline
 * one, and a bounded span beats an open one, because the narrower grant is the
 * one somebody actually thought about.
 */
export function specificity(held: Authorisation): number {
  return (held.classId === null ? 0 : 2) + (held.rangeHigh === null ? 0 : 1);
}

/**
 * The decision, across everything the person holds.
 *
 * <p>Any one authorisation that covers the request is enough. When none does,
 * the refusal quotes the near miss rather than the first row looked at: being
 * told the authorisation ran out last month is useful, being told nothing is
 * held when there is a lapsed one on file sends somebody to grant a duplicate.
 */
export function decide(
  held: readonly Authorisation[],
  request: AuthorisationRequest,
): AuthorisationDecision {
  let nearest: { held: Authorisation; reason: RefusalReason } | null = null;

  const candidates = [...held].sort((a, b) => specificity(b) - specificity(a));

  for (const candidate of candidates) {
    const refusal = coverage(candidate, request);

    if (refusal === null) {
      return {
        allowed: true,
        granted: candidate,
        reason: null,
        detail: describeGrant(candidate),
      };
    }
    if (refusal !== RefusalReason.NOTHING_HELD && !nearest) {
      nearest = { held: candidate, reason: refusal };
    }
  }

  if (!nearest) {
    return {
      allowed: false,
      granted: null,
      reason: RefusalReason.NOTHING_HELD,
      detail: `${request.person} holds nothing for ${request.discipline.toLowerCase()}`,
    };
  }
  return {
    allowed: false,
    granted: nearest.held,
    reason: nearest.reason,
    detail: describeRefusal(nearest.held, nearest.reason, request),
  };
}

/** The highest level a person can work at in a discipline on a given day. */
export function levelOn(
  held: readonly Authorisation[],
  person: string,
  discipline: string,
  classId: number,
  on: string,
): CompetenceLevel | null {
  let best: CompetenceLevel | null = null;

  for (const level of [
    CompetenceLevel.TRAINEE,
    CompetenceLevel.AUTHORISED,
    CompetenceLevel.APPROVER,
  ]) {
    const decision = decide(held, { person, discipline, classId, level, upTo: null, on });

    if (decision.allowed && (best === null || rankOf(level) > rankOf(best))) {
      best = level;
    }
  }
  return best;
}

/**
 * Authorisations that run out inside a window, worst first. What the quality
 * manager's renewal list is built from.
 */
export function expiringWithin(
  held: readonly Authorisation[],
  from: string,
  to: string,
): readonly Authorisation[] {
  return held
    .filter(
      (record) =>
        !record.withdrawn &&
        record.authorisedTo !== null &&
        record.authorisedTo >= from &&
        record.authorisedTo <= to,
    )
    .sort((a, b) => (a.authorisedTo ?? '').localeCompare(b.authorisedTo ?? ''));
}

function describeGrant(held: Authorisation): string {
  const where = held.classId === null ? held.discipline.toLowerCase() : `class ${held.classId}`;
  const span =
    held.rangeLow === null ? '' : ` from ${held.rangeLow} to ${held.rangeHigh}`;

  return `${held.person} is ${held.level.toLowerCase()} for ${where}${span}`;
}

function describeRefusal(
  held: Authorisation,
  reason: RefusalReason,
  request: AuthorisationRequest,
): string {
  switch (reason) {
    case RefusalReason.EXPIRED:
      return `${held.person}'s authorisation for ${held.discipline.toLowerCase()} ran out on ${held.authorisedTo}`;
    case RefusalReason.NOT_YET:
      return `${held.person} is not authorised for ${held.discipline.toLowerCase()} until ${held.authorisedFrom}`;
    case RefusalReason.WITHDRAWN:
      return `${held.person}'s authorisation for ${held.discipline.toLowerCase()} was withdrawn`;
    case RefusalReason.LEVEL_TOO_LOW:
      return `${held.person} is ${held.level.toLowerCase()} and this needs ${request.level.toLowerCase()}`;
    case RefusalReason.OUTSIDE_RANGE:
      return `${held.person} is authorised from ${held.rangeLow} to ${held.rangeHigh}, this reaches ${request.upTo}`;
    default:
      return `${held.person} is not authorised for this work`;
  }
}
