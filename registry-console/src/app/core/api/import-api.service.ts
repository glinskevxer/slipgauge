import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ImportReport } from '../models/import.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class ImportApiService {
  private readonly http = inject(RegistryHttpService);

  template(): Observable<{ filename: string; content: string }> {
    return this.http.get<{ filename: string; content: string }>('/instruments/import/template');
  }

  run(file: string, commit: boolean): Observable<ImportReport> {
    return this.http.post<ImportReport>('/instruments/import', { file }, { commit: String(commit) });
  }
}
