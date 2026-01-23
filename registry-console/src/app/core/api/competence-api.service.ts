import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CompetenceLevel,
  CompetenceMatrix,
  CompetenceView,
} from '../models/competence.model';
import { Discipline } from '../models/instrument.model';
import { RegistryHttpService } from './registry-http.service';

export interface GrantRequest {
  readonly person: string;
  readonly discipline: Discipline;
  readonly level: CompetenceLevel;
  readonly authorisedFrom: string;
  readonly authorisedTo?: string;
  readonly classCode?: string;
  readonly rangeLow?: number;
  readonly rangeHigh?: number;
  readonly evidence?: string;
}

@Injectable({ providedIn: 'root' })
export class CompetenceApiService {
  private readonly http = inject(RegistryHttpService);

  matrix(): Observable<CompetenceMatrix> {
    return this.http.get<CompetenceMatrix>('/competence/matrix');
  }

  expiring(withinDays: number): Observable<readonly CompetenceView[]> {
    return this.http.get<readonly CompetenceView[]>('/competence/expiring', { withinDays });
  }

  forPerson(person: string, includeWithdrawn = false): Observable<readonly CompetenceView[]> {
    return this.http.get<readonly CompetenceView[]>(
      `/competence/people/${encodeURIComponent(person)}`,
      includeWithdrawn ? { includeWithdrawn: 'true' } : {},
    );
  }

  forDiscipline(discipline: Discipline): Observable<readonly CompetenceView[]> {
    return this.http.get<readonly CompetenceView[]>(`/competence/disciplines/${discipline}`);
  }

  grant(request: GrantRequest): Observable<CompetenceView> {
    return this.http.post<CompetenceView>('/competence', request);
  }

  withdraw(id: number, reason: string): Observable<CompetenceView> {
    return this.http.post<CompetenceView>(`/competence/${id}/withdrawal`, { reason });
  }
}
