import { Injectable, Logger } from '@nestjs/common';

import { Clock } from '../config/clock';

/** How many attempts one key may make inside the window. */
export const ATTEMPT_LIMIT = 10;

/** How long the window is. */
export const ATTEMPT_WINDOW_MS = 60_000;

/** Nothing older than this is worth keeping, however quiet the service is. */
const SWEEP_AFTER_MS = 10 * ATTEMPT_WINDOW_MS;

interface Bucket {
  /** Timestamps inside the current window, oldest first. */
  readonly hits: number[];
  lastSeen: number;
}

export interface LimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Seconds until the caller may try again, zero while it is allowed. */
  readonly retryAfterSeconds: number;
}

/**
 * A sliding window over sign in attempts, keyed by whatever the caller says
 * identifies them.
 *
 * <p>This is deliberately in process. The laboratory runs one instance, the
 * account lock in app_user is the real defence, and a shared counter would
 * mean a second piece of infrastructure to keep running for a control that is
 * a speed bump rather than a wall. If the register is ever run behind more
 * than one instance this has to move, and that is the note to find.
 */
@Injectable()
export class AttemptLimiter {
  private readonly log = new Logger(AttemptLimiter.name);
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(private readonly clock: Clock) {}

  /** Records an attempt against the key and says whether it is allowed. */
  record(key: string): LimitDecision {
    const now = this.clock.now().getTime();

    this.sweep(now);

    const bucket = this.bucketFor(key, now);

    prune(bucket, now);

    if (bucket.hits.length >= ATTEMPT_LIMIT) {
      const oldest = bucket.hits[0] as number;
      const retryAfter = Math.ceil((oldest + ATTEMPT_WINDOW_MS - now) / 1000);

      this.log.warn(`too many attempts for ${key}, ${retryAfter}s to wait`);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retryAfter) };
    }

    bucket.hits.push(now);
    bucket.lastSeen = now;

    return {
      allowed: true,
      remaining: ATTEMPT_LIMIT - bucket.hits.length,
      retryAfterSeconds: 0,
    };
  }

  /** Clears the count for a key, which a successful sign in does. */
  clear(key: string): void {
    this.buckets.delete(key);
  }

  /** How many attempts a key has left, without recording one. */
  remaining(key: string): number {
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return ATTEMPT_LIMIT;
    }
    prune(bucket, this.clock.now().getTime());
    return Math.max(0, ATTEMPT_LIMIT - bucket.hits.length);
  }

  /** Only ever called by a test. */
  reset(): void {
    this.buckets.clear();
    this.lastSweep = 0;
  }

  private bucketFor(key: string, now: number): Bucket {
    const held = this.buckets.get(key);

    if (held) {
      return held;
    }
    const fresh: Bucket = { hits: [], lastSeen: now };

    this.buckets.set(key, fresh);
    return fresh;
  }

  /**
   * Drops keys nobody has used for a while. Without it the map grows by one
   * entry per username anybody ever guesses, which is a slow leak an attacker
   * controls the rate of.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < SWEEP_AFTER_MS) {
      return;
    }
    this.lastSweep = now;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastSeen > SWEEP_AFTER_MS) {
        this.buckets.delete(key);
      }
    }
  }
}

function prune(bucket: Bucket, now: number): void {
  const cutoff = now - ATTEMPT_WINDOW_MS;

  while (bucket.hits.length > 0 && (bucket.hits[0] as number) <= cutoff) {
    bucket.hits.shift();
  }
}
