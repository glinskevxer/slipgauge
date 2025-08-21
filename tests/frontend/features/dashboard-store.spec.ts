import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { RecallEntry, RecallStanding } from '@core/models/recall.model';
import { recallEntry } from '@fixtures';
import { DashboardStore } from '@features/dashboard/dashboard.store';

function assessment(id: number, severity: string, pending: number) {
  return {
    id,
    triggerCertificateId: id,
    triggerCertificateNumber: `SGM-${id}`,
    instrumentId: id,
    assetTag: `SG-00090${id}`,
    raisedAt: '2025-11-01T09:00:00Z',
    windowFrom: '2024-01-15',
    windowTo: '2025-11-01',
    status: 'ASSESSED',
    severity,
    maxDepth: 1,
    itemCount: 8,
    pendingCount: pending,
    closedAt: null,
    closedBy: null,
    conclusion: null,
    items: [],
  };
}

describe('DashboardStore', () => {
  let store: DashboardStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DashboardStore,
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(DashboardStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load(
    board: RecallEntry[],
    summary: Partial<{ overdue: number; unscheduled: number }> = {},
    assessments: unknown[] = [],
  ): void {
    store.load();
    http.expectOne((request) => request.url.endsWith('/recalls')).flush(board);
    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush({
      horizonDays: 120,
      overdue: 0,
      unscheduled: 0,
      byStanding: {},
      ...summary,
    });
    http.expectOne((request) => request.url.endsWith('/impact')).flush(assessments);
  }

  it('waits for all three calls before it stops loading', () => {
    store.load();
    expect(store.loading()).toBe(true);

    http.expectOne((request) => request.url.endsWith('/recalls')).flush([]);
    expect(store.loading()).toBe(true);

    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush({
      horizonDays: 120,
      overdue: 0,
      unscheduled: 0,
      byStanding: {},
    });
    http.expectOne((request) => request.url.endsWith('/impact')).flush([]);

    expect(store.loading()).toBe(false);
  });

  it('says nothing is wrong only when nothing is', () => {
    load([]);
    expect(store.nothingWrong()).toBe(true);
  });

  it('is not clear while an assessment is open', () => {
    load([], {}, [assessment(1, 'MEDIUM', 3)]);
    expect(store.nothingWrong()).toBe(false);
    expect(store.pendingDispositions()).toBe(3);
  });

  it('counts the high severity assessments separately', () => {
    load([], {}, [assessment(1, 'HIGH', 1), assessment(2, 'LOW', 0)]);

    expect(store.openAssessments()).toBe(2);
    expect(store.highSeverity()).toBe(1);
  });

  it('buckets the workload into weeks', () => {
    load([
      recallEntry('SG-000101', 2, 'DUE_THIS_WEEK'),
      recallEntry('SG-000102', 9, 'DUE_THIS_MONTH'),
      recallEntry('SG-000103', 10, 'DUE_THIS_MONTH'),
      recallEntry('SG-000104', 40, 'SCHEDULED'),
    ]);

    const weeks = store.workloadByWeek();
    expect(weeks).toHaveLength(12);
    expect(weeks[0].value).toBe(1);
    expect(weeks[1].value).toBe(2);
    expect(weeks[5].value).toBe(1);
  });

  it('folds overdue work into the first bar rather than dropping it', () => {
    load([recallEntry('SG-000105', -30, 'OVERDUE')], { overdue: 1 });

    expect(store.workloadByWeek()[0].value).toBe(1);
    expect(store.workloadByWeek()[0].tone).toBe('bad');
  });

  it('leaves anything past the horizon off the chart', () => {
    load([recallEntry('SG-000106', 200, 'SCHEDULED')]);

    expect(store.workloadByWeek().every((week) => week.value === 0)).toBe(true);
  });

  it('drops empty slices from the standing ring', () => {
    load([recallEntry('SG-000107', 2, 'DUE_THIS_WEEK')], { unscheduled: 0 });

    expect(store.standingMix().map((slice) => slice.label)).toEqual(['This week']);
  });

  it('includes the never calibrated count as its own slice', () => {
    load([recallEntry('SG-000108', 2, 'DUE_THIS_WEEK')], { unscheduled: 4 });

    expect(store.standingMix().map((slice) => slice.label)).toEqual([
      'This week',
      'Never done',
    ]);
  });

  it('counts only the next month by room and puts the busiest first', () => {
    load([
      recallEntry('SG-000109', 3, 'DUE_THIS_WEEK', { locationCode: 'HARLOW-DIM' }),
      recallEntry('SG-000110', 20, 'DUE_THIS_MONTH', { locationCode: 'HARLOW-DIM' }),
      recallEntry('SG-000111', 25, 'DUE_THIS_MONTH', { locationCode: 'CREWE-TOOL' }),
      recallEntry('SG-000112', 90, 'SCHEDULED', { locationCode: 'CREWE-TOOL' }),
    ]);

    expect(store.loadByLocation()).toEqual([
      { label: 'HARLOW-DIM', value: 2, tone: 'neutral' },
      { label: 'CREWE-TOOL', value: 1, tone: 'neutral' },
    ]);
  });

  it('groups instruments with no location under one heading', () => {
    load([recallEntry('SG-000113', 3, 'DUE_THIS_WEEK', { locationCode: null })]);

    expect(store.loadByLocation()[0].label).toBe('Unplaced');
  });

  it('lists the longest overdue first and stops at six', () => {
    load(
      Array.from({ length: 9 }, (_, index) =>
        recallEntry(`SG-0002${String(index).padStart(2, '0')}`, -index - 1, 'OVERDUE'),
      ),
      { overdue: 9 },
    );

    const worst = store.worstOffenders();
    expect(worst).toHaveLength(6);
    expect(worst[0].daysUntilDue).toBe(-9);
  });

  it('surfaces a failure rather than showing a half loaded screen', () => {
    store.load();
    http.expectOne((request) => request.url.endsWith('/recalls')).flush([]);
    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush({
      horizonDays: 120,
      overdue: 0,
      unscheduled: 0,
      byStanding: {},
    });
    http.expectOne((request) => request.url.endsWith('/impact')).flush(
      {
        type: 't',
        title: 'INTERNAL',
        status: 500,
        detail: 'boom',
        code: 'registry/internal',
        timestamp: 'now',
      },
      { status: 500, statusText: 'Server Error' },
    );

    expect(store.error()?.code).toBe('registry/internal');
    expect(store.loading()).toBe(false);
    expect(store.summary()).toBeNull();
  });
});
