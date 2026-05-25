import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ManagementReview, ReviewPeriod } from '../models/review.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class ReviewApiService {
  private readonly http = inject(RegistryHttpService);

  pack(period: ReviewPeriod | null): Observable<ManagementReview> {
    return this.http.get<ManagementReview>(
      '/management-review',
      period ? { from: period.from, to: period.to } : {},
    );
  }
}
