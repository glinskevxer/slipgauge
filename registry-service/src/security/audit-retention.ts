import { AuditOutcome } from './audit-event.entity';

/**
 * How long each kind of audit line is kept.
 *
 * <p>ISO/IEC 17025 asks for records to be retained for a defined period, not
 * for ever, and a trail that is never trimmed is a trail nobody can search by
 * the time it matters. The periods here are the laboratory's own, and they are
 * different per kind for a reason worth writing down.
 *
 * <p>A refused sign in is noise after a month; a refused anything else is the
 * shape of somebody trying to do what they are not allowed to, and that is kept
 * as long as the certificates it was trying to reach. Anything that actually
 * changed a record is kept for the life of the record.
 */

/** The life of a certificate, which is what the longest retention tracks. */
export const CERTIFICATE_RETENTION_YEARS = 7;

export interface RetentionRule {
  readonly actions: readonly RegExp[];
  readonly outcomes: readonly AuditOutcome[] | null;
  readonly days: number;
  readonly why: string;
}

/**
 * Read in order: the first rule that matches decides. The catch all is last and
 * is deliberately long, because a line nobody thought about is a line nobody
 * has decided is safe to lose.
 */
export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    actions: [/^auth\.signIn$/],
    outcomes: [AuditOutcome.DENIED],
    days: 30,
    why: 'a refused sign in is noise after a month unless it became something else',
  },
  {
    actions: [/^auth\.refresh$/],
    outcomes: null,
    days: 90,
    why: 'token refreshes are only interesting while a session could still be live',
  },
  {
    actions: [/^auth\./, /^user\./],
    outcomes: null,
    days: 365 * 3,
    why: 'who had which role, and when, is asked years later',
  },
  {
    actions: [/./],
    outcomes: [AuditOutcome.DENIED, AuditOutcome.FAILED],
    days: 365 * CERTIFICATE_RETENTION_YEARS,
    why: 'a refusal is the shape of somebody reaching for what they should not have',
  },
  {
    actions: [/./],
    outcomes: null,
    days: 365 * CERTIFICATE_RETENTION_YEARS,
    why: 'anything that changed a record is kept as long as the record',
  },
];

export function ruleFor(action: string, outcome: AuditOutcome): RetentionRule {
  const found = RETENTION_RULES.find(
    (rule) =>
      rule.actions.some((pattern) => pattern.test(action)) &&
      (rule.outcomes === null || rule.outcomes.includes(outcome)),
  );

  // The last rule matches everything, so this cannot happen. Returning it
  // rather than throwing keeps a sweep from stopping on a line it cannot grade.
  return found ?? RETENTION_RULES[RETENTION_RULES.length - 1];
}

export function retentionDays(action: string, outcome: AuditOutcome): number {
  return ruleFor(action, outcome).days;
}

/** True when a line has outlived the rule that covers it. */
export function isExpired(
  action: string,
  outcome: AuditOutcome,
  occurredAt: Date,
  now: Date,
): boolean {
  const age = (now.getTime() - occurredAt.getTime()) / 86_400_000;

  return age > retentionDays(action, outcome);
}

/** The oldest date a line of this kind may still carry. */
export function keepFrom(action: string, outcome: AuditOutcome, now: Date): Date {
  return new Date(now.getTime() - retentionDays(action, outcome) * 86_400_000);
}
