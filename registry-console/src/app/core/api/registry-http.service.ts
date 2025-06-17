import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * The one place a URL is assembled. Every feature service goes through here so
 * the base path, the parameter encoding and the eventual retry policy are set
 * once rather than copied into a dozen constructors.
 */
@Injectable({ providedIn: 'root' })
export class RegistryHttpService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  get<T>(path: string, params: Record<string, string | string[] | number> = {}): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.toHttpParams(params) });
  }

  post<T>(path: string, body: unknown, params: Record<string, string | number> = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body, { params: this.toHttpParams(params) });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }

  private url(path: string): string {
    return `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * Repeated parameters are appended one at a time. Passing an array straight
   * to HttpParams joins it with commas, which the service reads as a single
   * enum value and rejects.
   */
  private toHttpParams(source: Record<string, string | string[] | number>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          params = params.append(key, entry);
        }
      } else {
        params = params.set(key, String(value));
      }
    }
    return params;
  }
}
