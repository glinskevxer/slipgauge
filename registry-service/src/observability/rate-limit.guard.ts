import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';

import { ErrorCode, RegistryException } from '../common/errors';
import { Clock } from '../config/clock';
import type { AuthenticatedRequest } from '../security/jwt-auth.guard';
import { RegistryMetrics } from './registry-metrics.service';
import {
  RATE_WINDOW_MS,
  RouteCost,
  allowanceFor,
  costOf,
  limiterKey,
  retryAfterSeconds,
} from './rate-limit';

/** Refused because the caller is going too fast, not because it was wrong. */
class RateLimited extends RegistryException {
  constructor(seconds: number, cost: RouteCost) {
    super(
      ErrorCode.RULE_VIOLATION,
      HttpStatus.TOO_MANY_REQUESTS,
      `too many requests, try again in ${seconds} second${seconds === 1 ? '' : 's'}`,
    );
    this.with('retryAfterSeconds', seconds).with('cost', cost);
  }
}

interface Window {
  hits: number[];
  lastSeen: number;
}

/** Nothing older than ten windows is worth keeping. */
const SWEEP_AFTER_MS = 10 * RATE_WINDOW_MS;

/**
 * Keeps one caller from hammering the expensive routes.
 *
 * <p>In process, like the sign in limiter next door, and for the same reason:
 * the laboratory runs one instance and this is a speed bump rather than a wall.
 * The note about moving it to shared storage if that ever changes is in
 * rate-limit.ts beside the allowances.
 *
 * <p>Counted per person rather than per address. Everybody in the laboratory
 * shares one address, and a limit that treats them as one caller is a limit
 * that fires when the bench is busy, which is exactly when it must not.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly log = new Logger(RateLimitGuard.name);
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  constructor(
    private readonly clock: Clock,
    private readonly metrics: RegistryMetrics,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = (request.path ?? request.url ?? '').split('?')[0];
    const cost = costOf(request.method ?? 'GET', path);

    if (cost === null) {
      return true;
    }

    const caller = request.principal?.username ?? request.ip ?? 'unknown';
    const now = this.clock.now().getTime();

    this.sweep(now);

    const window = this.windowFor(limiterKey(cost, caller), now);

    window.hits = window.hits.filter((hit) => hit > now - RATE_WINDOW_MS);
    window.lastSeen = now;

    if (window.hits.length >= allowanceFor(cost)) {
      const seconds = retryAfterSeconds(window.hits[0], now);

      this.log.warn(`${caller} is over the ${cost} allowance, ${seconds}s to wait`);
      this.metrics.rateLimited(cost);
      throw new RateLimited(seconds, cost);
    }

    window.hits.push(now);
    return true;
  }

  /**
   * Forgets every caller. Only a test uses this, and it lives here rather than
   * in the test tree because a fake that drifts from the thing it replaces is
   * worse than no fake: the guard holds its counts in memory, so a suite that
   * could not clear them would be testing the last suite's traffic.
   */
  reset(): void {
    this.windows.clear();
    this.lastSweep = 0;
  }

  private windowFor(key: string, now: number): Window {
    const held = this.windows.get(key);

    if (held) {
      return held;
    }
    const fresh: Window = { hits: [], lastSeen: now };

    this.windows.set(key, fresh);
    return fresh;
  }

  /** Drops callers nobody has seen for ten windows, so the map cannot grow. */
  private sweep(now: number): void {
    if (now - this.lastSweep < RATE_WINDOW_MS) {
      return;
    }
    this.lastSweep = now;

    for (const [key, window] of this.windows) {
      if (now - window.lastSeen > SWEEP_AFTER_MS) {
        this.windows.delete(key);
      }
    }
  }
}
