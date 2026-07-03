import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';

import { CorrelatedRequest } from './correlation-id.middleware';
import { accessLine, isWorthLogging, levelFor, toAccessLine } from './access-log';
import { RegistryMetrics } from './registry-metrics.service';

/** Anything slower than this is logged, not just counted. */
export const SLOW_REQUEST_MS = 2_000;

/**
 * Times every request and files it under the route rather than the url.
 *
 * <p>The distinction matters. A register of four thousand instruments would
 * otherwise produce four thousand label values on one metric, which is how a
 * metrics database falls over. The route template has one value per endpoint
 * however many instruments there are.
 */
@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  private readonly log = new Logger(RequestTimingInterceptor.name);

  constructor(private readonly metrics: RegistryMetrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<CorrelatedRequest & { principal?: { username: string } }>();
    const route = routeOf(request);
    const started = process.hrtime.bigint();

    const record = (error?: unknown): void => {
      const seconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
      const ms = seconds * 1000;

      this.metrics.requestObserved(route, seconds);

      const status = statusOf(context, error);

      if (isWorthLogging(request.method ?? 'GET', route, status)) {
        const line = accessLine(
          toAccessLine(
            request.method ?? 'GET',
            route,
            status,
            ms,
            request.principal?.username ?? null,
            request.correlationId ?? null,
            codeOf(error),
          ),
        );

        // The level follows the status rather than whether an exception was
        // thrown. A 422 is the register doing its job and must not page
        // anybody; a 500 is the register failing and must.
        const level = levelFor(status);

        if (level === 'error') {
          this.log.error(line);
        } else if (level === 'warn') {
          this.log.warn(line);
        } else {
          this.log.log(line);
        }
      }

      if (ms > SLOW_REQUEST_MS) {
        this.log.warn(
          `${route} took ${Math.round(ms)}ms, correlation ` +
            `${request.correlationId ?? 'none'}`,
        );
      }
    };

    return next.handle().pipe(tap({ next: () => record(), error: (error) => record(error) }));
  }
}

/**
 * The route template Express matched, falling back to the method and a marker
 * when nothing matched. A 404 has no route, and labelling it with the url it
 * asked for is exactly the unbounded cardinality this avoids.
 */
export function routeOf(request: Request): string {
  const matched = (request.route as { path?: string } | undefined)?.path;
  const base = request.baseUrl ?? '';
  const method = (request.method ?? 'GET').toUpperCase();

  if (!matched) {
    return `${method} unmatched`;
  }
  const path = `${base}${matched === '/' ? '' : matched}`;

  return `${method} ${path.length > 0 ? path : '/'}`;
}

/**
 * The status the caller will see.
 *
 * <p>Read off the response when the handler returned, and off the exception
 * when it threw: the response object still says 200 at the moment an exception
 * passes this interceptor, because the filter has not run yet.
 */
function statusOf(context: ExecutionContext, error?: unknown): number {
  if (error && typeof error === 'object' && 'getStatus' in error) {
    const status = (error as { getStatus: () => number }).getStatus();

    return Number.isFinite(status) ? status : 500;
  }
  if (error) {
    return 500;
  }
  return context.switchToHttp().getResponse<{ statusCode?: number }>().statusCode ?? 200;
}

/** The registry error code, when the failure carried one. */
function codeOf(error?: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;

    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
