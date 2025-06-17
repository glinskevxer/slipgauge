import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { toRegistryError } from '../errors/problem';

/**
 * Converts every failed response into a RegistryError before it reaches a
 * component. Nothing downstream should ever have to know that HttpErrorResponse
 * exists, or that a proxy can return HTML where JSON was expected.
 */
export const problemDetailInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        return throwError(() => toRegistryError(error.status, error.error));
      }
      return throwError(() => error);
    }),
  );
