import {
  ATTEMPT_LIMIT,
  ATTEMPT_WINDOW_MS,
  AttemptLimiter,
} from '@registry/security/attempt-limiter.service';
import { Clock } from '@registry/config/clock';

/** A clock a test can wind forward, which is the whole subject here. */
class MovableClock extends Clock {
  private instant = new Date('2025-06-10T09:00:00Z');

  override now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

describe('the sign in attempt limiter', () => {
  let clock: MovableClock;
  let limiter: AttemptLimiter;

  beforeEach(() => {
    clock = new MovableClock();
    limiter = new AttemptLimiter(clock);
  });

  it('allows the first attempt and counts down from there', () => {
    const first = limiter.record('r.okonjo');

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(ATTEMPT_LIMIT - 1);
    expect(first.retryAfterSeconds).toBe(0);
  });

  it('allows exactly the number of attempts the policy names', () => {
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      expect(limiter.record('r.okonjo').allowed).toBe(true);
    }
    expect(limiter.record('r.okonjo').allowed).toBe(false);
  });

  it('says how long there is to wait once it refuses', () => {
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      limiter.record('r.okonjo');
    }
    clock.advance(20_000);

    const refused = limiter.record('r.okonjo');

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(40);
  });

  it('lets the window slide rather than resetting it in one lump', () => {
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      limiter.record('r.okonjo');
      clock.advance(1_000);
    }
    expect(limiter.record('r.okonjo').allowed).toBe(false);

    // Far enough for the oldest attempt to fall out of the window and no
    // further, so exactly one slot is freed.
    clock.advance(ATTEMPT_WINDOW_MS - 9_999);

    expect(limiter.record('r.okonjo').allowed).toBe(true);
    expect(limiter.record('r.okonjo').allowed).toBe(false);
  });

  it('counts each key on its own', () => {
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      limiter.record('r.okonjo');
    }

    expect(limiter.record('r.okonjo').allowed).toBe(false);
    expect(limiter.record('d.ferreira').allowed).toBe(true);
  });

  it('forgets a key that was cleared', () => {
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      limiter.record('r.okonjo');
    }
    limiter.clear('r.okonjo');

    expect(limiter.record('r.okonjo').allowed).toBe(true);
    expect(limiter.remaining('r.okonjo')).toBe(ATTEMPT_LIMIT - 1);
  });

  it('reports what is left without spending an attempt', () => {
    limiter.record('r.okonjo');
    limiter.record('r.okonjo');

    expect(limiter.remaining('r.okonjo')).toBe(ATTEMPT_LIMIT - 2);
    expect(limiter.remaining('r.okonjo')).toBe(ATTEMPT_LIMIT - 2);
  });

  it('reports a full allowance for a key it has never seen', () => {
    expect(limiter.remaining('nobody')).toBe(ATTEMPT_LIMIT);
  });

  it('clears the whole window once it has fully passed', () => {
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      limiter.record('r.okonjo');
    }
    clock.advance(ATTEMPT_WINDOW_MS + 1);

    expect(limiter.remaining('r.okonjo')).toBe(ATTEMPT_LIMIT);
    expect(limiter.record('r.okonjo').allowed).toBe(true);
  });

  it('drops keys nobody has used, so a guessing run cannot grow the map', () => {
    for (let i = 0; i < 50; i++) {
      limiter.record(`guess-${i}`);
    }
    clock.advance(11 * ATTEMPT_WINDOW_MS);

    // Any attempt at all triggers the sweep; the old keys go with it.
    limiter.record('r.okonjo');

    expect(limiter.remaining('guess-0')).toBe(ATTEMPT_LIMIT);
    expect(limiter.remaining('guess-49')).toBe(ATTEMPT_LIMIT);
  });
});
