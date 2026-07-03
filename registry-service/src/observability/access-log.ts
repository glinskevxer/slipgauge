/**
 * One line per request, as JSON.
 *
 * <p>The laboratory ships its logs to a collector that indexes fields and not
 * sentences, so an access line is written as an object. A human reading the
 * container output loses a little; a quality manager asking "what did anybody
 * do to certificate 4412 last Tuesday" gains the answer.
 *
 * <p>What is deliberately not here: the request body, the query string and any
 * header. A calibration sheet contains a customer's measurements, a sign in
 * body contains a password, and neither belongs in a log that is kept for a
 * year and read by whoever has access to the collector.
 */

export interface AccessLine {
  readonly at: string;
  readonly method: string;
  /** The route template, never the url, so the field has bounded cardinality. */
  readonly route: string;
  readonly status: number;
  readonly ms: number;
  readonly actor: string | null;
  readonly correlation: string | null;
  /** The registry error code, when the request was refused for a reason. */
  readonly code?: string;
}

/**
 * Requests nobody wants a line for. A health probe every ten seconds is noise,
 * and a scrape every fifteen is more of it.
 *
 * <p>Matched against the route template, which already carries the method: the
 * timing interceptor produces `GET /health` and nothing else does.
 */
const QUIET_ROUTES = new Set(['GET /health', 'GET /health/readiness', 'GET /metrics']);

export function isQuiet(_method: string, route: string): boolean {
  return QUIET_ROUTES.has(route);
}

/**
 * Whether the line is worth keeping at all.
 *
 * <p>Reads that succeeded are dropped. They are the overwhelming majority, they
 * are already counted by the metrics, and a log that is ninety nine percent
 * successful GETs is a log nobody greps. Everything that changed something, and
 * everything that failed, is kept.
 */
export function isWorthLogging(method: string, route: string, status: number): boolean {
  if (isQuiet(method, route)) {
    return false;
  }
  if (status >= 400) {
    return true;
  }
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/** The level a status deserves. A refusal is not a fault; a five hundred is. */
export function levelFor(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) {
    return 'error';
  }
  return status >= 400 ? 'warn' : 'info';
}

export function accessLine(line: AccessLine): string {
  return JSON.stringify(line);
}

/**
 * The fields, in a fixed order.
 *
 * <p>Fixed because the collector's own parser is happier with a stable shape
 * and because a diff of two log lines is readable when the keys line up.
 */
export function toAccessLine(
  method: string,
  route: string,
  status: number,
  ms: number,
  actor: string | null,
  correlation: string | null,
  code?: string,
  at: Date = new Date(),
): AccessLine {
  return {
    at: at.toISOString(),
    method: method.toUpperCase(),
    route,
    status,
    ms: Math.round(ms),
    actor,
    correlation,
    ...(code ? { code } : {}),
  };
}
