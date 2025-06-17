/**
 * Work held back while the registry cannot be reached.
 *
 * <p>The Crewe benches are on a link that drops for minutes at a time. Losing
 * a usage entry because of that is unacceptable: the whole point of the usage
 * log is that it is complete. So writes that are safe to repeat are queued and
 * replayed, and writes that are not are simply refused with a clear message.
 */

export type QueueableKind = 'USAGE';

export interface QueuedWrite {
  readonly id: string;
  readonly kind: QueueableKind;
  readonly path: string;
  readonly body: unknown;
  readonly describedAs: string;
  readonly queuedAt: number;
  readonly attempts: number;
  readonly lastError?: string;
}

/** Only these can be replayed. Anything else is refused rather than queued. */
const REPLAYABLE: Readonly<Record<QueueableKind, string>> = {
  USAGE: '/usage',
};

/** After this many failures a write is parked for a person to look at. */
export const ATTEMPT_LIMIT = 5;

/** Nothing older than this is replayed; a stale usage date needs a human. */
export const STALENESS_MS = 24 * 60 * 60 * 1000;

let sequence = 0;

export function queued(
  kind: QueueableKind,
  body: unknown,
  describedAs: string,
  at = Date.now(),
): QueuedWrite {
  sequence += 1;
  return {
    id: `q-${at.toString(36)}-${sequence}`,
    kind,
    path: REPLAYABLE[kind],
    body,
    describedAs,
    queuedAt: at,
    attempts: 0,
  };
}

export function isReplayable(path: string): boolean {
  return Object.values(REPLAYABLE).some((candidate) => path.endsWith(candidate));
}

export function kindFor(path: string): QueueableKind | null {
  for (const [kind, candidate] of Object.entries(REPLAYABLE)) {
    if (path.endsWith(candidate)) {
      return kind as QueueableKind;
    }
  }
  return null;
}

export function withFailure(write: QueuedWrite, message: string): QueuedWrite {
  return { ...write, attempts: write.attempts + 1, lastError: message };
}

export function isExhausted(write: QueuedWrite): boolean {
  return write.attempts >= ATTEMPT_LIMIT;
}

export function isStale(write: QueuedWrite, now = Date.now()): boolean {
  return now - write.queuedAt > STALENESS_MS;
}

/** What may still be sent, oldest first so the log keeps its order. */
export function replayable(
  queue: readonly QueuedWrite[],
  now = Date.now(),
): readonly QueuedWrite[] {
  return [...queue]
    .filter((write) => !isExhausted(write) && !isStale(write, now))
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

/** What needs a person: too many failures, or sat too long to be trusted. */
export function parked(
  queue: readonly QueuedWrite[],
  now = Date.now(),
): readonly QueuedWrite[] {
  return queue.filter((write) => isExhausted(write) || isStale(write, now));
}

export function describeQueue(queue: readonly QueuedWrite[], now = Date.now()): string {
  if (queue.length === 0) {
    return 'nothing waiting';
  }
  const stuck = parked(queue, now).length;
  const waiting = queue.length - stuck;
  if (stuck === 0) {
    return `${waiting} waiting to send`;
  }
  if (waiting === 0) {
    return `${stuck} could not be sent`;
  }
  return `${waiting} waiting, ${stuck} could not be sent`;
}

const STORAGE_KEY = 'slipgauge.queue';

export function readQueue(storage: Storage): readonly QueuedWrite[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    // A corrupt queue is worse than an empty one; losing it is at least visible.
    return [];
  }
}

export function writeQueue(storage: Storage, queue: readonly QueuedWrite[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked. The in memory queue still holds until reload.
  }
}
