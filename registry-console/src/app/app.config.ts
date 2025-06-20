import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { APP_ROUTES } from './app.routes';
import { bearerTokenInterceptor } from './core/auth/bearer-token.interceptor';
import { correlationInterceptor } from './core/interceptors/correlation.interceptor';
import { GlobalErrorHandler } from './core/errors/global-error.handler';
import { problemDetailInterceptor } from './core/interceptors/problem-detail.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(
      APP_ROUTES,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    // Order matters. The problem detail interceptor sits innermost so the
    // bearer interceptor sees a RegistryError rather than an HttpErrorResponse.
    provideHttpClient(
      withInterceptors([correlationInterceptor, bearerTokenInterceptor, problemDetailInterceptor]),
    ),
  ],
};
