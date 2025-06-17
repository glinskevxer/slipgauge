import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import {
  Discipline,
  InstrumentClassView,
  InstrumentStatus,
  StorageLocationView,
} from '../models/instrument.model';
import { RegistryHttpService } from './registry-http.service';

/**
 * Lookup lists. These change perhaps twice a year, so each one is fetched once
 * and shared. The console is a long lived tab on a bench terminal and refetching
 * thirty classes on every form open was showing up in the network log.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceApiService {
  private readonly http = inject(RegistryHttpService);

  private classesCache?: Observable<readonly InstrumentClassView[]>;
  private locationsCache?: Observable<readonly StorageLocationView[]>;

  classes(): Observable<readonly InstrumentClassView[]> {
    this.classesCache ??= this.http
      .get<readonly InstrumentClassView[]>('/reference/classes')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.classesCache;
  }

  locations(): Observable<readonly StorageLocationView[]> {
    this.locationsCache ??= this.http
      .get<readonly StorageLocationView[]>('/reference/locations')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.locationsCache;
  }

  disciplines(): Observable<readonly Discipline[]> {
    return this.http.get<readonly Discipline[]>('/reference/disciplines');
  }

  statuses(): Observable<readonly InstrumentStatus[]> {
    return this.http.get<readonly InstrumentStatus[]>('/reference/statuses');
  }

  /** Drops the caches after an administrator edits a class or a location. */
  invalidate(): void {
    this.classesCache = undefined;
    this.locationsCache = undefined;
  }
}
