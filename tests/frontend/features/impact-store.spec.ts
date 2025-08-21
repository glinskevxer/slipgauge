import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { ImpactItemView, ImpactView, byDepth, progress } from '@core/models/impact.model';
import { ImpactStore } from '@features/impact/impact.store';

function item(
  id: number,
  kind: ImpactItemView['kind'],
  depth: number,
  disposition: ImpactItemView['disposition'] = 'PENDING',
): ImpactItemView {
  return {
    id,
    kind,
    referenceId: id,
    assetTag: `SG-00010${id}`,
    label: `label ${id}`,
    occurredOn: '2024-06-11',
    depth,
    disposition,
    note: null,
  };
}

function assessment(overrides: Partial<ImpactView> = {}): ImpactView {
  const items = overrides.items ?? [
    item(1, 'USAGE', 0),
    item(2, 'CERTIFICATE', 1),
    item(3, 'INSTRUMENT', 1),
  ];
  return {
    id: 5,
    triggerCertificateId: 44,
    triggerCertificateNumber: 'SGM-I-010',
    instrumentId: 9,
    assetTag: 'SG-001001',
    raisedAt: '2026-03-10T09:00:00Z',
    windowFrom: '2024-01-15',
    windowTo: '2024-09-30',
    status: 'ASSESSED',
    severity: 'HIGH',
    maxDepth: 1,
    itemCount: items.length,
    pendingCount: items.filter((entry) => entry.disposition === 'PENDING').length,
    closedAt: null,
    closedBy: null,
    conclusion: null,
    items,
    ...overrides,
  };
}

describe('impact helpers', () => {
  it('groups the cascade one column per hop', () => {
    const columns = byDepth([item(1, 'USAGE', 0), item(2, 'CERTIFICATE', 1), item(3, 'USAGE', 1)]);

    expect(columns.map((column) => column.depth)).toEqual([0, 1]);
    expect(columns[1].items).toHaveLength(2);
  });

  it('reports an assessment with nothing caught as fully dispositioned', () => {
    expect(progress(assessment({ items: [], itemCount: 0, pendingCount: 0 }))).toBe(100);
  });

  it('reports progress as the settled share', () => {
    expect(progress(assessment())).toBe(0);
    expect(
      progress(
        assessment({
          items: [item(1, 'USAGE', 0, 'NO_EFFECT'), item(2, 'CERTIFICATE', 1)],
        }),
      ),
    ).toBe(50);
  });
});

describe('ImpactStore', () => {
  let store: ImpactStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ImpactStore,
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(ImpactStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadOpen(list: ImpactView[] = [assessment()]): void {
    store.loadOpen();
    http.expectOne((request) => request.url.endsWith('/impact')).flush(list);
    if (list.length > 0) {
      http.expectOne((request) => request.url.endsWith(`/impact/${list[0].id}`)).flush(list[0]);
    }
  }

  it('selects the first assessment as soon as the list lands', () => {
    loadOpen();

    expect(store.selected()?.assetTag).toBe('SG-001001');
  });

  it('selects nothing when there is nothing open', () => {
    loadOpen([]);

    expect(store.selected()).toBeNull();
    expect(store.assessments()).toEqual([]);
  });

  it('lays the items out one column per hop', () => {
    loadOpen();

    expect(store.columns().map((column) => column.depth)).toEqual([0, 1]);
  });

  it('filters by kind without refetching', () => {
    loadOpen();

    store.toggleKind('CERTIFICATE');
    expect(store.visibleItems().map((entry) => entry.kind)).toEqual(['CERTIFICATE']);

    store.toggleKind('USAGE');
    expect(store.visibleItems()).toHaveLength(2);

    store.toggleKind('CERTIFICATE');
    store.toggleKind('USAGE');
    expect(store.visibleItems()).toHaveLength(3);
  });

  it('can show only what still needs a disposition', () => {
    loadOpen([
      assessment({
        items: [item(1, 'USAGE', 0, 'NO_EFFECT'), item(2, 'CERTIFICATE', 1)],
      }),
    ]);

    store.togglePendingOnly();

    expect(store.visibleItems().map((entry) => entry.id)).toEqual([2]);
  });

  it('will not offer to close while anything is pending', () => {
    loadOpen();

    expect(store.canClose()).toBe(false);
  });

  it('offers to close once everything is settled', () => {
    loadOpen([
      assessment({
        items: [item(1, 'USAGE', 0, 'NO_EFFECT')],
      }),
    ]);

    expect(store.canClose()).toBe(true);
  });

  it('will not offer to close an assessment that is already closed', () => {
    loadOpen([
      assessment({
        status: 'CLOSED',
        items: [item(1, 'USAGE', 0, 'ACCEPTED')],
      }),
    ]);

    expect(store.canClose()).toBe(false);
  });

  it('replaces the assessment with what came back from a disposition', () => {
    loadOpen();

    store.dispose(1, 'NO_EFFECT', 'well inside the job tolerance');

    const request = http.expectOne((candidate) =>
      candidate.url.includes('/impact/5/items/1/disposition'),
    );
    expect(request.request.params.get('disposition')).toBe('NO_EFFECT');
    request.flush(assessment({ items: [item(1, 'USAGE', 0, 'NO_EFFECT')] }));

    expect(store.selected()?.pendingCount).toBe(0);
  });

  it('lists only the certificates the cascade caught', () => {
    loadOpen();

    expect(store.caughtCertificates().map((entry) => entry.id)).toEqual([2]);
  });

  it('reloads the open list after a close', () => {
    loadOpen([assessment({ items: [item(1, 'USAGE', 0, 'ACCEPTED')] })]);

    store.close('H Whitcombe', 'all reviewed');
    http
      .expectOne((request) => request.url.includes('/impact/5/closure'))
      .flush(assessment({ status: 'CLOSED', items: [item(1, 'USAGE', 0, 'ACCEPTED')] }));
    http.expectOne((request) => request.url.endsWith('/impact')).flush([]);

    expect(store.assessments()).toEqual([]);
  });

  it('refetches the assessment after withdrawing what it caught', () => {
    loadOpen();

    store.withdrawCaught('reference standard found out of tolerance');
    http
      .expectOne((request) => request.url.includes('/impact/5/withdrawals'))
      .flush({ assessmentId: 5, withdrawn: 1 });
    http.expectOne((request) => request.url.endsWith('/impact/5')).flush(assessment());

    expect(store.selected()?.id).toBe(5);
  });
});
