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
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'register',
    title: 'Instrument register',
    canActivate: [signedInGuard],
    loadChildren: () => import('./features/register/register.routes').then((m) => m.REGISTER_ROUTES),
  },
  {
    path: 'certificates',
    title: 'Certificates',
    canActivate: [signedInGuard],
    loadChildren: () =>
      import('./features/certificate/certificate.routes').then((m) => m.CERTIFICATE_ROUTES),
  },
  {
    path: 'recalls',
    title: 'Recall board',
    canActivate: [signedInGuard],
    loadChildren: () => import('./features/recall/recall.routes').then((m) => m.RECALL_ROUTES),
  },
  {
    path: 'impact',
    title: 'Impact assessments',
    canActivate: [signedInGuard],
    loadChildren: () => import('./features/impact/impact.routes').then((m) => m.IMPACT_ROUTES),
  },
  {
    path: '**',
    title: 'Not found',
    loadComponent: () => import('./shared/not-found.component').then((m) => m.NotFoundComponent),
  },
];
