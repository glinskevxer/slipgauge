import { Tone } from '@shared/tone';

export type AuditOutcome = 'ALLOWED' | 'DENIED' | 'FAILED';

export interface AuditLine {
  readonly id: number;
  readonly occurredAt: string;
  readonly actor: string;
  readonly action: string;
  readonly subject: string;
  readonly subjectId: string | null;
  readonly outcome: AuditOutcome;
  readonly detail: string | null;
  readonly correlation: string | null;
}

export function outcomeTone(outcome: AuditOutcome): Tone {
  switch (outcome) {
    case 'ALLOWED':
      return 'ok';
    case 'DENIED':
      return 'warn';
    case 'FAILED':
      return 'bad';
  }
}

/**
 * A repeated refusal from the same actor on the same action is the shape that
 * matters. One wrong password is a Monday; six in a minute is something else,
 * so the viewer groups them rather than listing them.
 */
export interface RefusalGroup {
  readonly actor: string;
  readonly action: string;
  readonly count: number;
  readonly first: string;
  readonly last: string;
  readonly lines: readonly AuditLine[];
}

export function groupRefusals(lines: readonly AuditLine[]): readonly RefusalGroup[] {
  const buckets = new Map<string, AuditLine[]>();
  for (const line of lines) {
    const key = `${line.actor}::${line.action}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(line);
    } else {
      buckets.set(key, [line]);
    }
  }

  return [...buckets.values()]
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      return {
        actor: sorted[0].actor,
        action: sorted[0].action,
        count: sorted.length,
        first: sorted[0].occurredAt,
        last: sorted[sorted.length - 1].occurredAt,
        lines: sorted,
      };
    })
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

/** Groups that look like somebody trying passwords rather than mistyping one. */
export function suspicious(groups: readonly RefusalGroup[], threshold = 3): readonly RefusalGroup[] {
  return groups.filter((group) => group.count >= threshold);
}

/** A short sentence for one line, which is what the instrument page shows. */
export function describe(line: AuditLine): string {
  const what = line.subjectId ? `${line.subject} ${line.subjectId}` : line.subject;
  const verb = line.outcome === 'ALLOWED' ? '' : ` (${line.outcome.toLowerCase()})`;
  return `${line.actor} ${line.action} ${what}${verb}`;
}
