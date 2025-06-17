import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ChainNode } from '../models/calibration.model';
import { InstrumentQuery, queryToParams } from '../models/instrument-query.model';
import {
  InstrumentDetail,
  InstrumentStatus,
  InstrumentSummary,
  RegisterInstrumentRequest,
  UpdateInstrumentRequest,
} from '../models/instrument.model';
import { Page } from '../models/page.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class InstrumentApiService {
  private readonly http = inject(RegistryHttpService);

  search(
    query: InstrumentQuery,
    page: number,
    size: number,
    sort?: string,
  ): Observable<Page<InstrumentSummary>> {
    return this.http.get<Page<InstrumentSummary>>('/instruments', {
      ...queryToParams(query),
      page,
      size,
      ...(sort ? { sort } : {}),
    });
  }

  byId(id: number): Observable<InstrumentDetail> {
    return this.http.get<InstrumentDetail>(`/instruments/${id}`);
  }

  byAssetTag(assetTag: string): Observable<InstrumentDetail> {
    return this.http.get<InstrumentDetail>(`/instruments/by-tag/${encodeURIComponent(assetTag)}`);
  }

  chain(id: number): Observable<ChainNode> {
    return this.http.get<ChainNode>(`/instruments/${id}/chain`);
  }

  register(request: RegisterInstrumentRequest): Observable<InstrumentDetail> {
    return this.http.post<InstrumentDetail>('/instruments', request);
  }

  /**
   * Replaces the editable half of an instrument. The whole shape has to be
   * sent, so callers read the record first rather than patching a field and
   * quietly clearing everything they left out.
   */
  update(id: number, request: UpdateInstrumentRequest): Observable<InstrumentDetail> {
    return this.http.put<InstrumentDetail>(`/instruments/${id}`, request);
  }

  changeStatus(id: number, target: InstrumentStatus): Observable<InstrumentDetail> {
    return this.http.post<InstrumentDetail>(`/instruments/${id}/status`, null, { target });
  }

  retire(id: number, on?: string): Observable<InstrumentDetail> {
    return this.http.post<InstrumentDetail>(
      `/instruments/${id}/retirement`,
      null,
      on ? { on } : {},
    );
  }
}
