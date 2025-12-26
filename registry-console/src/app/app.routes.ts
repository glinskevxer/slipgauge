import { Routes } from '@angular/router';

import { roleGuard, signedInGuard } from './core/auth/signed-in.guard';

export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'overview',
  },
  {
    path: 'overview',
    title: 'Overview',
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'sign-in',
    title: 'Sign in',
    loadComponent: () => import('./features/auth/sign-in.component').then((m) => m.SignInComponent),
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
    path: 'jobs',
    title: 'Job desk',
    canActivate: [signedInGuard],
    loadChildren: () => import('./features/jobs/jobs.routes').then((m) => m.JOB_ROUTES),
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
    path: 'refusals',
    title: 'Refusals',
    canActivate: [roleGuard('AUDITOR', 'QUALITY_MANAGER', 'ADMIN')],
    loadComponent: () =>
      import('./features/audit/audit-viewer.component').then((m) => m.AuditViewerComponent),
  },
  {
    path: 'terminal',
    title: 'This terminal',
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('./features/preferences/preferences-panel.component').then(
        (m) => m.PreferencesPanelComponent,
      ),
  },
  {
    path: 'admin',
    title: 'Administration',
    canActivate: [signedInGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: '**',
    title: 'Not found',
    loadComponent: () => import('./shared/not-found.component').then((m) => m.NotFoundComponent),
  },
];
