import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { BuildInfoService, CONSOLE_VERSION } from '@core/build-info';
import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';

describe('BuildInfoService', () => {
  let build: BuildInfoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    build = TestBed.inject(BuildInfoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function land(version = CONSOLE_VERSION, uptimeSeconds = 42): void {
    http.expectOne((request) => request.url.endsWith('/build')).flush({
      version,
      laboratory: 'Slipgauge Metrology',
      startedAt: '2026-08-05T09:00:00Z',
      uptimeSeconds,
    });
  }

  it('knows its own version without asking anybody', () => {
    expect(build.console).toBe(CONSOLE_VERSION);
    expect(build.service()).toBeNull();
  });

  it('asks the service once however many screens want it', () => {
    build.load();
    build.load();

    land();
    expect(build.service()?.laboratory).toBe('Slipgauge Metrology');
  });

  it('says nothing is wrong when the two halves agree', () => {
    build.load();
    land();

    expect(build.mismatched()).toBe(false);
  });

  it('spots two halves from different releases', () => {
    build.load();
    land('0.9.3');

    expect(build.mismatched()).toBe(true);
  });

  it('does not claim a mismatch it cannot see', () => {
    expect(build.mismatched()).toBe(false);

    build.load();
    http
      .expectOne((request) => request.url.endsWith('/build'))
      .error(new ProgressEvent('offline'), { status: 0, statusText: 'Unknown Error' });

    expect(build.service()).toBeNull();
    expect(build.mismatched()).toBe(false);
  });

  it('reads an uptime the way a person would say it', () => {
    build.load();
    land(CONSOLE_VERSION, 42);
    expect(build.uptime()).toBe('42 seconds');
  });

  it('rounds down through minutes, hours and days', () => {
    build.load();
    land(CONSOLE_VERSION, 60 * 45);

    expect(build.uptime()).toBe('45 minutes');
  });

  it('switches to hours and then to days as it goes', () => {
    build.load();
    land(CONSOLE_VERSION, 3600 * 5);
    expect(build.uptime()).toBe('5 hours');
  });

  it('reports a long running service in days', () => {
    build.load();
    land(CONSOLE_VERSION, 86400 * 12);
    expect(build.uptime()).toBe('12 days');
  });

  it('reports nothing at all as no uptime rather than failing', () => {
    expect(build.uptime()).toBe('0 seconds');
  });
});
