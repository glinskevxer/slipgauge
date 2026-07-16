import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ItemCondition } from '../models/job.model';
import { LoanView } from '../models/loan.model';
import { RegistryHttpService } from './registry-http.service';

export interface IssueRequest {
  readonly assetTag: string;
  readonly borrower: string;
  readonly destination: string;
  readonly issuedOn: string;
  readonly dueBackOn: string;
  readonly purpose?: string;
  readonly conditionOut?: ItemCondition;
  readonly note?: string;
}

@Injectable({ providedIn: 'root' })
export class LoanApiService {
  private readonly http = inject(RegistryHttpService);

  list(includeReturned: boolean): Observable<readonly LoanView[]> {
    return this.http.get<readonly LoanView[]>(
      '/loans',
      includeReturned ? { includeReturned: 'true' } : {},
    );
  }

  forInstrument(assetTag: string): Observable<readonly LoanView[]> {
    return this.http.get<readonly LoanView[]>(`/loans/instruments/${assetTag}`);
  }

  issue(request: IssueRequest): Observable<LoanView> {
    return this.http.post<LoanView>('/loans', request);
  }

  bookBack(
    id: number,
    returnedOn: string,
    conditionBack: ItemCondition,
    note?: string,
  ): Observable<LoanView> {
    return this.http.post<LoanView>(`/loans/${id}/return`, {
      returnedOn,
      conditionBack,
      ...(note ? { note } : {}),
    });
  }
}
