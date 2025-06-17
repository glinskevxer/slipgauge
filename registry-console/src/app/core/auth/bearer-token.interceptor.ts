import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { RegistryError } from '@core/errors/problem';
import { SessionService } from './session.service';

const OPEN_PATHS = ['/auth/token', '/auth/refresh'];

/**
 * Attaches the bearer token and recovers from one expiry.
 *
 * <p>A single retry is deliberate. A refresh that fails means the session is
 * genuinely gone, and retrying past that turns a signed out user into a burst
 * of requests against an endpoint that will keep refusing them.
 */
export const bearerTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionService);
  const router = inject(Router);

  if (OPEN_PATHS.some((path) => request.url.includes(path))) {
    return next(request);
  }

  const token = session.accessToken();
  const authorised = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof RegistryError) || error.status !== 401 || !token) {
        return throwError(() => error);
      }
      return session.refresh().pipe(
        switchMap((pair) =>
          next(
            request.clone({ setHeaders: { Authorization: `Bearer ${pair.accessToken}` } }),
          ),
        ),
        catchError((refreshFailure: unknown) => {
          session.signOut();
          void router.navigate(['/sign-in']);
          return throwError(() => refreshFailure);
        }),
      );
    }),
  );
};
