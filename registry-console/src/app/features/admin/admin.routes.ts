import { Routes } from '@angular/router';

import { roleGuard } from '@core/auth/signed-in.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'classes',
  },
  {
    path: 'classes',
    title: 'Calibration classes',
    canActivate: [roleGuard('ADMIN')],
    loadComponent: () =>
      import('./class-admin.component').then((m) => m.ClassAdminComponent),
  },
  {
    path: 'locations',
    title: 'Site tree',
    canActivate: [roleGuard('ADMIN')],
    loadComponent: () =>
      import('./location-admin.component').then((m) => m.LocationAdminComponent),
  },
];
