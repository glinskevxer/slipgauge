import { Routes } from '@angular/router';

export const REGISTER_ROUTES: Routes = [
  {
    path: '',
    title: 'Instrument register',
    loadComponent: () =>
      import('./register-page.component').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'new',
    title: 'Book an instrument in',
    loadComponent: () =>
      import('./booking/booking-form.component').then((m) => m.BookingFormComponent),
  },
  {
    path: ':id',
    title: 'Instrument',
    loadComponent: () =>
      import('../instrument/instrument-page.component').then((m) => m.InstrumentPageComponent),
  },
];
