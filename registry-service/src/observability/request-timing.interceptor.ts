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

    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const route = routeOf(request);
    const started = process.hrtime.bigint();

    const record = (): void => {
      const seconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;

      this.metrics.requestObserved(route, seconds);

      if (seconds * 1000 > SLOW_REQUEST_MS) {
        this.log.warn(
          `${route} took ${Math.round(seconds * 1000)}ms, correlation ` +
            `${request.correlationId ?? 'none'}`,
        );
      }
    };

    return next.handle().pipe(tap({ next: record, error: record }));
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
