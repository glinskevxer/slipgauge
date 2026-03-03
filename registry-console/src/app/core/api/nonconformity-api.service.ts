import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CapaStage,
  CapaSummary,
  NonconformanceView,
  NonconformitySeverity,
  NonconformitySource,
  stageRoute,
} from '../models/nonconformity.model';
import { RegistryHttpService } from './registry-http.service';

export interface RaiseRequest {
  readonly source: NonconformitySource;
  readonly severity: NonconformitySeverity;
  readonly title: string;
  readonly detail: string;
  readonly sourceRef?: string;
  readonly owner?: string;
  readonly dueOn?: string;
}

@Injectable({ providedIn: 'root' })
export class NonconformityApiService {
  private readonly http = inject(RegistryHttpService);

  summary(): Observable<CapaSummary> {
    return this.http.get<CapaSummary>('/nonconformities/summary');
  }

  list(state: CapaStage | null, includeClosed: boolean): Observable<readonly NonconformanceView[]> {
    const params: Record<string, string> = {};

    if (state) {
      params['state'] = state;
    }
    if (includeClosed) {
      params['includeClosed'] = 'true';
    }
    return this.http.get<readonly NonconformanceView[]>('/nonconformities', params);
  }

  get(reference: string): Observable<NonconformanceView> {
    return this.http.get<NonconformanceView>(`/nonconformities/${reference}`);
  }

  raise(request: RaiseRequest): Observable<NonconformanceView> {
    return this.http.post<NonconformanceView>('/nonconformities', request);
  }

  /**
   * Records one stage. The route is worked out from the stage rather than
   * passed in, so a caller cannot post a containment to the cause route.
   */
  recordStage(reference: string, stage: CapaStage, text: string): Observable<NonconformanceView> {
    const route = stageRoute(stage);

    if (!route) {
      throw new Error(`${stage} does not carry an answer`);
    }
    return this.http.post<NonconformanceView>(`/nonconformities/${reference}/${route}`, { text });
  }

  assign(reference: string, owner: string, dueOn?: string): Observable<NonconformanceView> {
    return this.http.post<NonconformanceView>(`/nonconformities/${reference}/assignment`, {
      owner,
      ...(dueOn ? { dueOn } : {}),
    });
  }

  close(reference: string): Observable<NonconformanceView> {
    return this.http.post<NonconformanceView>(`/nonconformities/${reference}/closure`, null);
  }

  abandon(reference: string, reason: string): Observable<NonconformanceView> {
    return this.http.post<NonconformanceView>(`/nonconformities/${reference}/abandonment`, {
      reason,
    });
  }
}
