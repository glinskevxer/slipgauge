import { Routes } from '@angular/router';

import { roleGuard } from '@core/auth/signed-in.guard';

export const CERTIFICATE_ROUTES: Routes = [
  {
    path: 'new',
    title: 'Enter a calibration sheet',
    canActivate: [roleGuard('TECHNICIAN', 'METROLOGIST')],
    loadComponent: () =>
      import('./entry/sheet-entry.component').then((m) => m.SheetEntryComponent),
  },
  {
    path: ':id/print',
    title: 'Certificate',
    loadComponent: () =>
      import('./print/certificate-print.component').then((m) => m.CertificatePrintComponent),
  },
];
