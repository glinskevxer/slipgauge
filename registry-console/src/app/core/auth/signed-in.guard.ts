import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Role } from './session.model';
import { SessionService } from './session.service';

/** Keeps a signed out visitor off every page but the sign in screen. */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);

  if (session.signedIn()) {
    return true;
  }
  return router.createUrlTree(['/sign-in'], { queryParams: { next: state.url } });
};

/**
 * Guards a route behind one or more roles. Returns the register rather than the
 * sign in screen, because the visitor is signed in and simply cannot be here.
 */
export function roleGuard(...roles: readonly Role[]): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);

    if (!session.signedIn()) {
      return router.createUrlTree(['/sign-in']);
    }
    return session.has(...roles) ? true : router.createUrlTree(['/register']);
  };
}
