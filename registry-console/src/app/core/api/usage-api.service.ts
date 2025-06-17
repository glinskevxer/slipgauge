import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { LogUsageRequest, UsageView, UsageWindow } from '../models/usage.model';
import { Page } from '../models/page.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class UsageApiService {
  private readonly http = inject(RegistryHttpService);

  log(request: LogUsageRequest): Observable<UsageView> {
    return this.http.post<UsageView>('/usage', request);
  }

  forInstrument(instrumentId: number, page = 0, size = 25): Observable<Page<UsageView>> {
    return this.http.get<Page<UsageView>>(`/usage/instruments/${instrumentId}`, { page, size });
  }

  forWorkOrder(workOrder: string): Observable<readonly UsageView[]> {
    return this.http.get<readonly UsageView[]>(
      `/usage/work-orders/${encodeURIComponent(workOrder)}`,
    );
  }

  inWindow(instrumentId: number, from: string, to: string): Observable<UsageWindow> {
    return this.http.get<UsageWindow>(`/usage/instruments/${instrumentId}/window`, {
      from,
      to,
    });
  }
}
