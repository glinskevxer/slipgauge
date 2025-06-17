import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuditLine } from '../models/audit.model';
import { Page } from '../models/page.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class AuditApiService {
  private readonly http = inject(RegistryHttpService);

  byActor(actor: string, page = 0, size = 50): Observable<Page<AuditLine>> {
    return this.http.get<Page<AuditLine>>(`/audit/actors/${encodeURIComponent(actor)}`, {
      page,
      size,
    });
  }

  bySubject(subject: string, subjectId: string): Observable<readonly AuditLine[]> {
    return this.http.get<readonly AuditLine[]>('/audit/subjects', { subject, subjectId });
  }

  refusals(days = 7): Observable<readonly AuditLine[]> {
    return this.http.get<readonly AuditLine[]>('/audit/refusals', { days });
  }
}
