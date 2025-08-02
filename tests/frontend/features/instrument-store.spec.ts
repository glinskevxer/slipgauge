import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { InstrumentStore } from '@features/instrument/instrument.store';
import { certificate as buildCertificate, detail } from '@fixtures';

const DETAIL = detail('SG-000101', { id: 12 });

const certificate = (number: string, performedOn: string, asFound: string) =>
  buildCertificate(number, {
    performedOn,
    issuedOn: performedOn,
    asFoundVerdict: asFound as never,
  });

describe('InstrumentStore', () => {
  let store: InstrumentStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InstrumentStore,
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(InstrumentStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadWith(history: unknown[], decisions: unknown[] = [], chain: unknown = null) {
    store.load(12);
    http.expectOne((request) => request.url.endsWith('/instruments/12')).flush(DETAIL);
    http.expectOne((request) => request.url.includes('/certificates')).flush(history);
    http
      .expectOne((request) => request.url.includes('/recalls/instruments/12/decisions'))
      .flush(decisions);
    const chainRequest = http.expectOne((request) => request.url.endsWith('/instruments/12/chain'));
    if (chain === null) {
      chainRequest.flush(null, { status: 500, statusText: 'Server Error' });
    } else {
      chainRequest.flush(chain);
    }
  }

  it('loads the header before the rest and stops loading when they land', () => {
    loadWith([]);

    expect(store.detail()?.assetTag).toBe('SG-000101');
    expect(store.loading()).toBe(false);
  });

  it('treats the newest certificate as the latest one', () => {
    loadWith([
      certificate('SGM-003', '2025-04-14', 'PASS'),
      certificate('SGM-002', '2024-04-14', 'MARGINAL'),
    ]);

    expect(store.latest()?.certificateNumber).toBe('SGM-003');
  });

  it('reverses the history for the drift chart, which plots forwards', () => {
    loadWith([
      certificate('SGM-003', '2025-04-14', 'PASS'),
      certificate('SGM-002', '2024-04-14', 'PASS'),
    ]);

    expect(store.historyForward().map((entry) => entry.certificateNumber)).toEqual([
      'SGM-002',
      'SGM-003',
    ]);
  });

  it('flags an instrument whose last result was out of tolerance', () => {
    loadWith([certificate('SGM-004', '2025-04-14', 'OUT_OF_TOLERANCE')]);

    expect(store.hasFailedRecently()).toBe(true);
  });

  it('does not flag one whose last result was merely marginal', () => {
    loadWith([certificate('SGM-005', '2025-04-14', 'MARGINAL')]);

    expect(store.hasFailedRecently()).toBe(false);
  });

  it('picks out the decision that is still current', () => {
    loadWith(
      [],
      [
        { id: 2, current: true, intervalDays: 406, basis: 'EXTENDED', delta: 41 },
        { id: 1, current: false, intervalDays: 365, basis: 'BASE', delta: 0 },
      ],
    );

    expect(store.currentInterval()?.intervalDays).toBe(406);
  });

  it('carries on without a chain when that call fails', () => {
    loadWith([]);

    expect(store.chain()).toBeNull();
    expect(store.chainFaultCount()).toBe(0);
    expect(store.detail()).not.toBeNull();
  });

  it('counts the faults on a chain it did get', () => {
    loadWith([], [], {
      kind: 'CERTIFICATE',
      certificateId: 1,
      instrumentId: 12,
      assetTag: 'SG-000101',
      label: 'SGM-006',
      performedOn: '2025-04-14',
      validUntil: null,
      verdict: 'PASS',
      sound: true,
      note: null,
      children: [
        {
          kind: 'EXTERNAL_STANDARD',
          certificateId: null,
          instrumentId: null,
          assetTag: null,
          label: 'Expired lab',
          performedOn: null,
          validUntil: '2024-12-31',
          verdict: null,
          sound: false,
          note: 'expired',
          children: [],
        },
      ],
    });

    expect(store.chainFaultCount()).toBe(1);
  });

  it('offers a return to service only from a status that allows it', () => {
    loadWith([]);
    expect(store.canGoBackInService()).toBe(false);

    store.changeStatus('QUARANTINED');
    http
      .expectOne((request) => request.url.includes('/instruments/12/status'))
      .flush({ ...DETAIL, status: 'QUARANTINED' });

    expect(store.canGoBackInService()).toBe(true);
  });

  it('surfaces a failure on the header call and stops loading', () => {
    store.load(12);
    http.expectOne((request) => request.url.endsWith('/instruments/12')).flush(
      {
        type: 't',
        title: 'NOT_FOUND',
        status: 404,
        detail: 'instrument 12 does not exist',
        code: 'registry/not-found',
        timestamp: 'now',
      },
      { status: 404, statusText: 'Not Found' },
    );

    expect(store.loading()).toBe(false);
    expect(store.error()?.isNotFound).toBe(true);
    expect(store.detail()).toBeNull();
  });
});
