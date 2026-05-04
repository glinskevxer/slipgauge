/**
 * How hard one caller may push one kind of route.
 *
 * <p>Reads are not limited. Somebody paging through the register at speed is
 * somebody doing their job, and a limit that fires on a read is a limit that
 * gets raised until it never fires at all.
 *
 * <p>What is limited is the writes, and they are limited by what they cost
 * rather than by a single number. Filing a certificate walks the traceability
 * chain, replays an interval and may raise an impact assessment; uploading a
 * logger file re-reads a day of readings either side. Those two deserve very
 * different allowances from booking a job in.
 */
export enum RouteCost {
  /** Cheap writes: a job line, a usage record, a note. */
  LIGHT = 'LIGHT',
  /** Writes that touch several tables: a certificate, a review, an import. */
  HEAVY = 'HEAVY',
  /** Writes that walk history: a room sweep, a bulk withdrawal. */
  SWEEPING = 'SWEEPING',
}

/** Requests allowed per minute, per caller, per cost. */
const ALLOWANCE: Readonly<Record<RouteCost, number>> = {
  [RouteCost.LIGHT]: 120,
  [RouteCost.HEAVY]: 30,
  [RouteCost.SWEEPING]: 6,
};

export const RATE_WINDOW_MS = 60_000;

export function allowanceFor(cost: RouteCost): number {
  return ALLOWANCE[cost];
}

/**
 * Which cost a path carries.
 *
 * <p>Matched on the path rather than declared with a decorator on purpose. The
 * costs are a property of what the route does to the database, and keeping them
 * in one readable table is what lets somebody arguing about a limit see every
 * one of them at once instead of grepping for a decorator.
 */
const SWEEPING: readonly RegExp[] = [
  /^\/api\/environment\/readings$/,
  /^\/api\/environment\/excursions\/\d+\/withdrawals$/,
  /^\/api\/instruments\/import$/,
  /^\/api\/recalls\/instruments\/\d+\/reassessment$/,
];

const HEAVY: readonly RegExp[] = [
  /^\/api\/certificates$/,
  /^\/api\/certificates\/\d+\/(approval|withdrawal|attachments)$/,
  /^\/api\/jobs\/[^/]+\/(review|decline|complete|dispatch)$/,
  /^\/api\/proficiency\/[^/]+\/(submission|score)$/,
  /^\/api\/impact\/\d+\/.+$/,
];

/** Verbs that change nothing and are never limited. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isRead(method: string): boolean {
  return READ_METHODS.has(method.toUpperCase());
}

export function costOf(method: string, path: string): RouteCost | null {
  if (isRead(method)) {
    return null;
  }
  if (SWEEPING.some((pattern) => pattern.test(path))) {
    return RouteCost.SWEEPING;
  }
  if (HEAVY.some((pattern) => pattern.test(path))) {
    return RouteCost.HEAVY;
  }
  return RouteCost.LIGHT;
}

/** The key one caller is counted under, per cost. */
export function limiterKey(cost: RouteCost, caller: string): string {
  return `route:${cost}:${caller}`;
}

/**
 * How long the caller should wait, rounded up to a whole second and never
 * zero. A Retry-After of zero reads as "try again immediately", which is what
 * a client will then do.
 */
export function retryAfterSeconds(oldestHitAt: number, now: number): number {
  return Math.max(1, Math.ceil((oldestHitAt + RATE_WINDOW_MS - now) / 1000));
}
