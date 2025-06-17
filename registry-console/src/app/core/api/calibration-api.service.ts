import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CertificateView, ChainReport } from '../models/calibration.model';
import { RegistryHttpService } from './registry-http.service';

@Injectable({ providedIn: 'root' })
export class CalibrationApiService {
  private readonly http = inject(RegistryHttpService);

  historyFor(assetTag: string): Observable<readonly CertificateView[]> {
    return this.http.get<readonly CertificateView[]>('/certificates', { assetTag });
  }

  byId(id: number): Observable<CertificateView> {
    return this.http.get<CertificateView>(`/certificates/${id}`);
  }

  chain(id: number): Observable<ChainReport> {
    return this.http.get<ChainReport>(`/certificates/${id}/chain`);
  }

  approve(id: number, approver: string): Observable<CertificateView> {
    return this.http.post<CertificateView>(`/certificates/${id}/approval`, null, { approver });
  }

  withdraw(id: number, reason: string): Observable<CertificateView> {
    return this.http.post<CertificateView>(`/certificates/${id}/withdrawal`, null, { reason });
  }
}
