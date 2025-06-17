import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import {
  Criticality,
  Discipline,
  InstrumentClassView,
  StorageLocationView,
} from '../models/instrument.model';
import { ReferenceApiService } from './reference-api.service';
import { RegistryHttpService } from './registry-http.service';

export interface ClassRequest {
  readonly code: string;
  readonly name: string;
  readonly discipline: Discipline;
  readonly baseIntervalDays: number;
  readonly minIntervalDays: number;
  readonly maxIntervalDays: number;
  readonly criticality: Criticality;
}

export interface LocationRequest {
  readonly code: string;
  readonly name: string;
  readonly site: string;
  readonly parentCode?: string | null;
}

/**
 * Reference data maintenance. Every write drops the lookup caches, because a
 * class the administrator has just renamed showing its old name in the booking
 * form is the kind of thing that gets reported as data loss.
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(RegistryHttpService);
  private readonly reference = inject(ReferenceApiService);

  createClass(request: ClassRequest): Observable<InstrumentClassView> {
    return this.http
      .post<InstrumentClassView>('/admin/classes', request)
      .pipe(tap(() => this.reference.invalidate()));
  }

  updateClass(code: string, request: ClassRequest): Observable<InstrumentClassView> {
    return this.http
      .put<InstrumentClassView>(`/admin/classes/${encodeURIComponent(code)}`, request)
      .pipe(tap(() => this.reference.invalidate()));
  }

  createLocation(request: LocationRequest): Observable<StorageLocationView> {
    return this.http
      .post<StorageLocationView>('/admin/locations', request)
      .pipe(tap(() => this.reference.invalidate()));
  }

  reparent(code: string, parentCode: string | null): Observable<StorageLocationView> {
    return this.http
      .put<StorageLocationView>(`/admin/locations/${encodeURIComponent(code)}/parent`, {
        parentCode,
      })
      .pipe(tap(() => this.reference.invalidate()));
  }
}
