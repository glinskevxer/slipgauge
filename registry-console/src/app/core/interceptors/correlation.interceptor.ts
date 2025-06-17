import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Stamps every call with an id the service logs alongside its own. When a
 * technician reports that something failed at half past two, this is what turns
 * that into one line in the service log.
 */
export const correlationInterceptor: HttpInterceptorFn = (request, next) =>
  next(
    request.clone({
      setHeaders: {
        'X-Correlation-Id': newCorrelationId(),
      },
    }),
  );

function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
