import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ImpactDisposition, ImpactItemView, ImpactView } from '../models/impact.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class ImpactApiService {
  private readonly http = inject(RegistryHttpService);

  open(): Observable<readonly ImpactView[]> {
    return this.http.get<readonly ImpactView[]>('/impact');
  }

  byId(id: number): Observable<ImpactView> {
    return this.http.get<ImpactView>(`/impact/${id}`);
  }

  items(id: number): Observable<readonly ImpactItemView[]> {
    return this.http.get<readonly ImpactItemView[]>(`/impact/${id}/items`);
  }

  forInstrument(instrumentId: number): Observable<readonly ImpactView[]> {
    return this.http.get<readonly ImpactView[]>(`/impact/instruments/${instrumentId}`);
  }

  dispose(
    id: number,
    itemId: number,
    disposition: ImpactDisposition,
    note?: string,
  ): Observable<ImpactView> {
    return this.http.post<ImpactView>(`/impact/${id}/items/${itemId}/disposition`, null, {
      disposition,
      ...(note ? { note } : {}),
    });
  }

  close(id: number, by: string, conclusion: string): Observable<ImpactView> {
    return this.http.post<ImpactView>(`/impact/${id}/closure`, null, { by, conclusion });
  }

  withdrawCaught(id: number, reason: string): Observable<{ withdrawn: number }> {
    return this.http.post<{ withdrawn: number }>(`/impact/${id}/withdrawals`, null, { reason });
  }
}
