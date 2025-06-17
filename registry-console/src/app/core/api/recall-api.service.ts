import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { IntervalSummary, RecallEntry, RecallStanding } from '../models/recall.model';
import { RegistryHttpService } from './registry-http.service';

export interface RecallSummary {
  readonly horizonDays: number;
  readonly overdue: number;
  readonly unscheduled: number;
  readonly byStanding: Partial<Record<RecallStanding, number>>;
}

@Injectable({ providedIn: 'root' })
export class RecallApiService {
  private readonly http = inject(RegistryHttpService);

  board(horizonDays: number): Observable<readonly RecallEntry[]> {
    return this.http.get<readonly RecallEntry[]>('/recalls', { horizonDays });
  }

  chase(): Observable<readonly RecallEntry[]> {
    return this.http.get<readonly RecallEntry[]>('/recalls/chase');
  }

  unscheduled(): Observable<readonly RecallEntry[]> {
    return this.http.get<readonly RecallEntry[]>('/recalls/unscheduled');
  }

  summary(horizonDays: number): Observable<RecallSummary> {
    return this.http.get<RecallSummary>('/recalls/summary', { horizonDays });
  }

  decisions(instrumentId: number): Observable<readonly IntervalSummary[]> {
    return this.http.get<readonly IntervalSummary[]>(
      `/recalls/instruments/${instrumentId}/decisions`,
    );
  }

  reassess(instrumentId: number): Observable<IntervalSummary> {
    return this.http.post<IntervalSummary>(
      `/recalls/instruments/${instrumentId}/reassessment`,
      null,
    );
  }
}
