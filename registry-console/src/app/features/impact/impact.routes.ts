import { Routes } from '@angular/router';

export const IMPACT_ROUTES: Routes = [
  {
    path: '',
    title: 'Impact assessments',
    loadComponent: () =>
      import('./impact-explorer.component').then((m) => m.ImpactExplorerComponent),
  },
];
