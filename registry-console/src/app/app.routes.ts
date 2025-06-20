import { Routes } from '@angular/router';

import { signedInGuard } from './core/auth/signed-in.guard';

/**
 * Everything past sign in is lazy. The console is used on bench terminals over
 * a laboratory network, and the first load is the one that has to be quick.
 */
export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'overview',
  },
  {
    path: 'sign-in',
    title: 'Sign in',
    loadComponent: () => import('./features/auth/sign-in.component').then((m) => m.SignInComponent),
  },
  {
    path: 'overview',
    title: 'Overview',
    canActivate: [signedInGuard],
    loadComponent: () => import('./shared/not-found.component').then((m) => m.NotFoundComponent),
  },
  {
    path: '**',
    title: 'Not found',
    loadComponent: () => import('./shared/not-found.component').then((m) => m.NotFoundComponent),
  },
];
