import { Routes } from '@angular/router';

export const RECALL_ROUTES: Routes = [
  {
    path: '',
    title: 'Recall board',
    loadComponent: () =>
      import('./recall-board.component').then((m) => m.RecallBoardComponent),
  },
  {
    path: 'capacity',
    title: 'Capacity',
    loadComponent: () =>
      import('../capacity/capacity-board.component').then((m) => m.CapacityBoardComponent),
  },
];
