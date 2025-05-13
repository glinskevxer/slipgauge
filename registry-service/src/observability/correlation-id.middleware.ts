import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** The header the reverse proxy sets and the console echoes back. */
export const CORRELATION_HEADER = 'x-correlation-id';

/** A caller supplied value longer than this is truncated rather than refused. */
export const MAX_CORRELATION_LENGTH = 64;

export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

/**
 * Gives every request an id and puts it back on the response.
 *
 * <p>A caller supplied id is honoured because the console generates one per
 * user action and a single action can be three calls. It is sanitised first:
 * the value ends up in log lines and in the audit trail, so anything that is
 * not a plain identifier is dropped rather than escaped.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction): void {
    const supplied = request.headers[CORRELATION_HEADER];
    const correlationId = sanitise(Array.isArray(supplied) ? supplied[0] : supplied);

    request.correlationId = correlationId;
    response.setHeader(CORRELATION_HEADER, correlationId);
    next();
  }
}

/**
 * Keeps letters, digits, dashes and underscores and nothing else. An empty
 * result means the caller sent something unusable, so a fresh id is minted
 * rather than a blank one being carried through the logs.
 */
export function sanitise(value: string | undefined): string {
  const cleaned = (value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX_CORRELATION_LENGTH);

  return cleaned.length > 0 ? cleaned : randomUUID();
}
