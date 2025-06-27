import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { RegistryHttpService } from '@core/api/registry-http.service';
import { ReferenceApiService } from '@core/api/reference-api.service';
import { SessionService } from '@core/auth/session.service';
import { bearerTokenInterceptor } from '@core/auth/bearer-token.interceptor';
import { correlationInterceptor } from '@core/interceptors/correlation.interceptor';
import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { RegistryError } from '@core/errors/problem';

describe('RegistryHttpService', () => {
  let http: RegistryHttpService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(RegistryHttpService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('puts the base path in front of a relative path', () => {
    http.get('/instruments').subscribe();

    backend.expectOne((request) => request.url === '/api/instruments').flush([]);
  });

  it('copes with a path that was written without a leading slash', () => {
    http.get('instruments').subscribe();

    backend.expectOne((request) => request.url === '/api/instruments').flush([]);
  });

  it('appends a repeated parameter once per value', () => {
    http.get('/instruments', { statuses: ['IN_SERVICE', 'ON_LOAN'] }).subscribe();

    const request = backend.expectOne((candidate) => candidate.url === '/api/instruments');
    expect(request.request.params.getAll('statuses')).toEqual(['IN_SERVICE', 'ON_LOAN']);
    request.flush([]);
  });

  it('leaves an empty or absent parameter off entirely', () => {
    http.get('/instruments', { text: '', page: 0 }).subscribe();

    const request = backend.expectOne((candidate) => candidate.url === '/api/instruments');
    expect(request.request.params.has('text')).toBe(false);
    expect(request.request.params.get('page')).toBe('0');
    request.flush([]);
  });

  it('sends a post body through untouched', () => {
    http.post('/usage', { assetTag: 'SG-000101' }).subscribe();

    const request = backend.expectOne((candidate) => candidate.url === '/api/usage');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ assetTag: 'SG-000101' });
    request.flush({});
  });
});

describe('the correlation interceptor', () => {
  let client: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([correlationInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('stamps every call with an id', () => {
    client.get('/api/instruments').subscribe();

    const request = backend.expectOne('/api/instruments');
    expect(request.request.headers.get('X-Correlation-Id')).toBeTruthy();
    request.flush([]);
  });

  it('uses a different id on each call', () => {
    client.get('/api/instruments').subscribe();
    client.get('/api/recalls').subscribe();

    const first = backend.expectOne('/api/instruments');
    const second = backend.expectOne('/api/recalls');

    expect(first.request.headers.get('X-Correlation-Id')).not.toBe(
      second.request.headers.get('X-Correlation-Id'),
    );
    first.flush([]);
    second.flush([]);
  });
});

describe('the bearer interceptor', () => {
  let client: HttpClient;
  let backend: HttpTestingController;
  let session: SessionService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([bearerTokenInterceptor, problemDetailInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    backend.verify();
    sessionStorage.clear();
  });

  function signIn(): void {
    session.signIn('h.whitcombe', 'password').subscribe();
    backend.expectOne('/api/auth/token').flush({
      accessToken: token(Math.floor(Date.now() / 1000) + 3600),
      refreshToken: token(Math.floor(Date.now() / 1000) + 36000),
      username: 'h.whitcombe',
      displayName: 'Helen Whitcombe',
      roles: ['METROLOGIST'],
    });
  }

  it('sends nothing while nobody is signed in', () => {
    client.get('/api/instruments').subscribe();

    const request = backend.expectOne('/api/instruments');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
  });

  it('leaves the sign in call alone even when a session exists', () => {
    signIn();
    session.signIn('h.whitcombe', 'password').subscribe();

    const request = backend.expectOne('/api/auth/token');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({
      accessToken: token(Math.floor(Date.now() / 1000) + 3600),
      refreshToken: 'r',
      username: 'h.whitcombe',
      displayName: 'Helen Whitcombe',
      roles: [],
    });
  });

  it('attaches the token to everything else', () => {
    signIn();
    client.get('/api/instruments').subscribe();

    const request = backend.expectOne('/api/instruments');
    expect(request.request.headers.get('Authorization')).toContain('Bearer ');
    request.flush([]);
  });

  it('refreshes once on a rejected token and retries the call', () => {
    signIn();
    let landed: unknown = null;
    client.get('/api/instruments').subscribe((value) => (landed = value));

    backend.expectOne('/api/instruments').flush(
      { code: 'registry/unauthenticated', status: 401, detail: 'expired', title: 'x', type: 't', timestamp: 'now' },
      { status: 401, statusText: 'Unauthorized' },
    );

    backend
      .expectOne((request) => request.url === '/api/auth/refresh')
      .flush({
        accessToken: token(Math.floor(Date.now() / 1000) + 3600),
        refreshToken: 'r2',
        username: 'h.whitcombe',
        displayName: 'Helen Whitcombe',
        roles: ['METROLOGIST'],
      });

    backend.expectOne('/api/instruments').flush([{ id: 1 }]);
    expect(landed).toEqual([{ id: 1 }]);
  });

  it('gives up and signs out when the refresh is refused too', () => {
    signIn();
    let failure: RegistryError | null = null;
    client.get('/api/instruments').subscribe({
      error: (error: RegistryError) => (failure = error),
    });

    backend.expectOne('/api/instruments').flush(
      { code: 'registry/unauthenticated', status: 401, detail: 'expired', title: 'x', type: 't', timestamp: 'now' },
      { status: 401, statusText: 'Unauthorized' },
    );
    backend
      .expectOne((request) => request.url === '/api/auth/refresh')
      .flush(
        { code: 'registry/unauthenticated', status: 401, detail: 'gone', title: 'x', type: 't', timestamp: 'now' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(session.signedIn()).toBe(false);
    expect(failure).not.toBeNull();
  });

  it('does not try to refresh a failure that is not a rejected token', () => {
    signIn();
    client.get('/api/instruments').subscribe({ error: () => undefined });

    backend.expectOne('/api/instruments').flush(
      { code: 'registry/internal', status: 500, detail: 'boom', title: 'x', type: 't', timestamp: 'now' },
      { status: 500, statusText: 'Server Error' },
    );

    backend.expectNone((request) => request.url === '/api/auth/refresh');
  });
});

describe('ReferenceApiService caching', () => {
  let reference: ReferenceApiService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    reference = TestBed.inject(ReferenceApiService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('fetches the class list once however many callers ask', () => {
    reference.classes().subscribe();
    reference.classes().subscribe();

    backend.expectOne('/api/reference/classes').flush([]);
  });

  it('fetches again after an administrator changes something', () => {
    reference.classes().subscribe();
    backend.expectOne('/api/reference/classes').flush([]);

    reference.invalidate();
    reference.classes().subscribe();
    backend.expectOne('/api/reference/classes').flush([]);
  });

  it('does not cache the small enum lists, which are free', () => {
    reference.disciplines().subscribe();
    reference.disciplines().subscribe();

    backend.match('/api/reference/disciplines').forEach((request) => request.flush([]));
  });
});

function token(expiresAtSeconds: number): string {
  const payload = btoa(JSON.stringify({ sub: 'h.whitcombe', exp: expiresAtSeconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}
