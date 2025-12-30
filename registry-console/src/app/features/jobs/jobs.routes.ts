import { Routes } from '@angular/router';

export const JOB_ROUTES: Routes = [
  {
    path: '',
    title: 'Job desk',
    loadComponent: () => import('./job-desk.component').then((m) => m.JobDeskComponent),
  },
  {
    path: ':reference',
    title: 'Job',
    loadComponent: () => import('./job-sheet.component').then((m) => m.JobSheetComponent),
  },
];
