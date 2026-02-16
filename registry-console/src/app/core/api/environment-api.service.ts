import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AffectedWork,
  EnvironmentLimitView,
  ExcursionView,
  RoomTrace,
} from '../models/environment.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class EnvironmentApiService {
  private readonly http = inject(RegistryHttpService);

  limits(locationCode?: string): Observable<readonly EnvironmentLimitView[]> {
    return this.http.get<readonly EnvironmentLimitView[]>(
      '/environment/limits',
      locationCode ? { location: locationCode } : {},
    );
  }

  excursions(locationCode: string | null, unassessedOnly: boolean): Observable<readonly ExcursionView[]> {
    const params: Record<string, string> = {};

    if (locationCode) {
      params['location'] = locationCode;
    }
    if (unassessedOnly) {
      params['unassessed'] = 'true';
    }
    return this.http.get<readonly ExcursionView[]>('/environment/excursions', params);
  }

  trace(locationCode: string, from: string, to: string): Observable<RoomTrace> {
    return this.http.get<RoomTrace>(`/environment/rooms/${locationCode}/trace`, { from, to });
  }

  affected(excursionId: number): Observable<AffectedWork> {
    return this.http.get<AffectedWork>(`/environment/excursions/${excursionId}/affected`);
  }

  assess(excursionId: number, finding: string): Observable<ExcursionView> {
    return this.http.post<ExcursionView>(`/environment/excursions/${excursionId}/assessment`, {
      finding,
    });
  }

  withdrawAffected(
    excursionId: number,
    reason: string,
  ): Observable<{ withdrawn: number; alreadyWithdrawn: number }> {
    return this.http.post<{ withdrawn: number; alreadyWithdrawn: number }>(
      `/environment/excursions/${excursionId}/withdrawals`,
      { reason },
    );
  }
}
