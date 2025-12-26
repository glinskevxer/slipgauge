import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AcceptancePolicy,
  ContractReviewView,
  JobDeskSummary,
  JobState,
  JobSummary,
  JobView,
  LineProgress,
} from '../models/job.model';
import { Page } from '../models/page.model';
import { RegistryHttpService } from './registry-http.service';

/** What a review would say before anybody records it. */
export interface ReviewPreview {
  readonly reference: string;
  readonly outcome: string;
  readonly findings: ReadonlyArray<{
    readonly clause: string;
    readonly severity: string;
    readonly lineNumber: number | null;
    readonly detail: string;
  }>;
  readonly acceptable: boolean;
  readonly decisionRulePending: boolean;
}

export interface JobQuery {
  readonly state?: JobState;
  readonly customer?: string;
  readonly page?: number;
  readonly size?: number;
  readonly sort?: string;
}

@Injectable({ providedIn: 'root' })
export class JobApiService {
  private readonly http = inject(RegistryHttpService);

  desk(): Observable<JobDeskSummary> {
    return this.http.get<JobDeskSummary>('/jobs/desk');
  }

  search(query: JobQuery = {}): Observable<Page<JobSummary>> {
    const params: Record<string, string | number> = {};

    if (query.state) {
      params['state'] = query.state;
    }
    if (query.customer) {
      params['customer'] = query.customer;
    }
    if (query.page !== undefined) {
      params['page'] = query.page;
    }
    if (query.size !== undefined) {
      params['size'] = query.size;
    }
    if (query.sort) {
      params['sort'] = query.sort;
    }
    return this.http.get<Page<JobSummary>>('/jobs', params);
  }

  get(reference: string): Observable<JobView> {
    return this.http.get<JobView>(`/jobs/${reference}`);
  }

  progress(reference: string): Observable<readonly LineProgress[]> {
    return this.http.get<readonly LineProgress[]>(`/jobs/${reference}/progress`);
  }

  preview(reference: string, policy: AcceptancePolicy | null): Observable<ReviewPreview> {
    return this.http.get<ReviewPreview>(
      `/jobs/${reference}/review/preview`,
      policy ? { policy } : {},
    );
  }

  review(reference: string): Observable<ContractReviewView> {
    return this.http.get<ContractReviewView>(`/jobs/${reference}/review`);
  }

  record(
    reference: string,
    body: { acceptancePolicy: AcceptancePolicy; methodReference?: string; comment?: string },
  ): Observable<JobView> {
    return this.http.post<JobView>(`/jobs/${reference}/review`, body);
  }

  decline(reference: string, reason: string): Observable<JobView> {
    return this.http.post<JobView>(`/jobs/${reference}/decline`, { reason });
  }

  /** start, complete and dispatch all take no body and return the whole job. */
  move(reference: string, action: string): Observable<JobView> {
    return this.http.post<JobView>(`/jobs/${reference}/${action}`, null);
  }

  repromise(reference: string, promisedOn: string, reason: string): Observable<JobView> {
    return this.http.post<JobView>(`/jobs/${reference}/promise`, { promisedOn, reason });
  }
}
