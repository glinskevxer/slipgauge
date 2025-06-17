import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { RegistryHttpService } from '@core/api/registry-http.service';
import { Role, Session, TokenPair, hasAnyRole, isExpiring, sessionFrom } from './session.model';

const STORAGE_KEY = 'slipgauge.session';

/**
 * Holds the signed in session.
 *
 * <p>The pair is kept in session storage rather than local storage. Bench
 * terminals are shared between shifts and a token that survives the browser
 * closing is a token the next shift inherits.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(RegistryHttpService);
  private readonly sessionState = signal<Session | null>(restore());

  readonly session = this.sessionState.asReadonly();
  readonly signedIn = computed(() => this.sessionState() !== null);
  readonly displayName = computed(() => this.sessionState()?.displayName ?? '');
  readonly roles = computed<readonly Role[]>(() => this.sessionState()?.roles ?? []);

  readonly canApprove = computed(() =>
    hasAnyRole(this.sessionState(), 'METROLOGIST', 'QUALITY_MANAGER'),
  );
  readonly canWithdraw = computed(() => hasAnyRole(this.sessionState(), 'QUALITY_MANAGER'));
  readonly canRecord = computed(() =>
    hasAnyRole(this.sessionState(), 'TECHNICIAN', 'METROLOGIST'),
  );
  readonly readOnly = computed(
    () => this.signedIn() && !this.canRecord() && !this.canApprove(),
  );

  signIn(username: string, password: string): Observable<TokenPair> {
    return this.http
      .post<TokenPair>('/auth/token', { username, password })
      .pipe(tap((pair) => this.adopt(pair)));
  }

  refresh(): Observable<TokenPair> {
    const current = this.sessionState();
    return this.http
      .post<TokenPair>('/auth/refresh', null, { refreshToken: current?.refreshToken ?? '' })
      .pipe(tap((pair) => this.adopt(pair)));
  }

  signOut(): void {
    this.sessionState.set(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing refuses storage; the in memory session still cleared.
    }
  }

  accessToken(): string | null {
    return this.sessionState()?.accessToken ?? null;
  }

  needsRefresh(): boolean {
    const current = this.sessionState();
    return current !== null && isExpiring(current);
  }

  has(...roles: readonly Role[]): boolean {
    return hasAnyRole(this.sessionState(), ...roles);
  }

  private adopt(pair: TokenPair): void {
    const session = sessionFrom(pair);
    this.sessionState.set(session);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage being unavailable is not fatal, it only costs a reload.
    }
  }
}

function restore(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw) as Session;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}
