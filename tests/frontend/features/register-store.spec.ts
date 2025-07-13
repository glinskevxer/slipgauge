import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { RegisterStore } from '@features/register/register.store';
import { pageOf, summary } from '@fixtures';

describe('RegisterStore', () => {
  let store: RegisterStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RegisterStore,
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    store = TestBed.inject(RegisterStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushSearch(items: ReturnType<typeof summary>[], overrides = {}) {
    const request = http.expectOne((candidate) => candidate.url.endsWith('/instruments'));
    request.flush(pageOf(items, overrides));
    return request;
  }

  it('starts empty and not loading', () => {
    expect(store.rows()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.summary()).toBe('No instruments match');
  });

  it('fills the grid from the first load', () => {
    store.load(0);
    expect(store.loading()).toBe(true);

    flushSearch([summary('SG-000001'), summary('SG-000002')]);

    expect(store.rows()).toHaveLength(2);
    expect(store.loading()).toBe(false);
    expect(store.summary()).toBe('1 to 2 of 2');
  });

  it('drops the answer to a request that has already been superseded', () => {
    store.load(0);
    const first = http.expectOne((candidate) => candidate.url.endsWith('/instruments'));

    store.applyQuery({ text: 'mahr' });
    const second = http.expectOne((candidate) => candidate.url.endsWith('/instruments'));

    second.flush(pageOf([summary('SG-000009')]));
    first.flush(pageOf([summary('SG-000001'), summary('SG-000002')]));

    expect(store.rows().map((entry) => entry.assetTag)).toEqual(['SG-000009']);
  });

  it('flips the direction when the same column is clicked twice', () => {
    store.sortBy('model');
    flushSearch([]);
    expect(store.sort()).toBe('model');
    expect(store.directionFor('model')).toBe('asc');

    store.sortBy('model');
    flushSearch([]);
    expect(store.sort()).toBe('-model');
    expect(store.directionFor('model')).toBe('desc');
  });

  it('clicking the column the grid already sorts by reverses it', () => {
    expect(store.sort()).toBe('assetTag');

    store.sortBy('assetTag');
    flushSearch([]);

    expect(store.sort()).toBe('-assetTag');
  });

  it('reports no direction for a column that is not the sort', () => {
    store.sortBy('status');
    flushSearch([]);

    expect(store.directionFor('assetTag')).toBeNull();
  });

  it('counts the filters that are on', () => {
    store.applyQuery({ text: 'mahr', statuses: ['IN_SERVICE'] });
    flushSearch([]);

    expect(store.filterCount()).toBe(2);
  });

  it('refuses to page past the ends', () => {
    store.load(0);
    flushSearch([summary('SG-000001')], { totalPages: 2, last: false });

    store.previous();
    http.expectNone((candidate) => candidate.url.endsWith('/instruments'));

    store.next();
    flushSearch([summary('SG-000002')], { page: 1, totalPages: 2, first: false, last: true });

    store.next();
    http.expectNone((candidate) => candidate.url.endsWith('/instruments'));
  });

  it('will not jump to a page outside the result', () => {
    store.load(0);
    flushSearch([summary('SG-000001')], { totalPages: 2 });

    store.goToPage(5);
    http.expectNone((candidate) => candidate.url.endsWith('/instruments'));
  });

  it('keeps a selection until the query changes', () => {
    store.load(0);
    flushSearch([summary('SG-000001'), summary('SG-000002')]);

    store.toggleSelection(1);
    store.toggleSelection(2);
    expect(store.selectionCount()).toBe(2);
    expect(store.allOnPageSelected()).toBe(true);

    store.toggleSelection(1);
    expect(store.selectionCount()).toBe(1);
    expect(store.allOnPageSelected()).toBe(false);

    store.applyQuery({ text: 'other' });
    flushSearch([]);
    expect(store.selectionCount()).toBe(0);
  });

  it('select all on an empty page selects nothing', () => {
    store.load(0);
    flushSearch([]);

    store.toggleAllOnPage();
    expect(store.selectionCount()).toBe(0);
    expect(store.allOnPageSelected()).toBe(false);
  });

  it('surfaces a failure and stops loading', () => {
    store.load(0);
    http
      .expectOne((candidate) => candidate.url.endsWith('/instruments'))
      .flush(
        { code: 'registry/internal', status: 500, detail: 'boom', title: 'INTERNAL', type: 't', timestamp: 'now' },
        { status: 500, statusText: 'Server Error' },
      );

    expect(store.loading()).toBe(false);
    expect(store.error()?.code).toBe('registry/internal');
  });

  it('adopts a view carried in the address bar before its first fetch', () => {
    store.adopt({ q: 'mahr', status: 'QUARANTINED', sort: '-model', page: '2' });

    const request = http.expectOne((candidate) => candidate.url.endsWith('/instruments'));
    expect(request.request.params.get('text')).toBe('mahr');
    expect(request.request.params.get('statuses')).toBe('QUARANTINED');
    expect(request.request.params.get('sort')).toBe('-model');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(pageOf([]));

    expect(store.filterCount()).toBe(2);
    expect(store.sort()).toBe('-model');
  });

  it('ignores nonsense in the address rather than sending it on', () => {
    store.adopt({ status: 'NOT_A_STATUS', sort: 'evil.path' });

    const request = http.expectOne((candidate) => candidate.url.endsWith('/instruments'));
    expect(request.request.params.get('statuses')).toBeNull();
    expect(request.request.params.get('sort')).toBe('assetTag');
    request.flush(pageOf([]));
  });

  it('reports the view it is currently showing', () => {
    store.adopt({ q: 'tesa' });
    http.expectOne((candidate) => candidate.url.endsWith('/instruments')).flush(pageOf([]));

    expect(store.currentView()).toEqual({
      query: { text: 'tesa' },
      page: 0,
      sort: 'assetTag',
    });
  });

  it('says the grid is empty only once loading has finished', () => {
    store.load(0);
    expect(store.isEmpty()).toBe(false);

    flushSearch([]);
    expect(store.isEmpty()).toBe(true);
  });
});
