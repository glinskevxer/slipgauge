import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  RecallEntry,
  RecallStanding,
  basisLabel,
  dueInWords,
  standingLabel,
  standingTone,
} from '@core/models/recall.model';
import { recallEntry } from '@fixtures';
import { RecallStore } from '@features/recall/recall.store';

describe('recall labels', () => {
  it('reads a due date as a person would say it', () => {
    expect(dueInWords(0)).toBe('today');
    expect(dueInWords(1)).toBe('in 1 day');
    expect(dueInWords(12)).toBe('in 12 days');
    expect(dueInWords(-1)).toBe('1 day ago');
    expect(dueInWords(-9)).toBe('9 days ago');
  });

  it('says so plainly when there is no due date at all', () => {
    expect(dueInWords(Number.MAX_SAFE_INTEGER)).toBe('no due date');
  });

  it('has a readable label for every standing and basis', () => {
    expect(standingLabel('DUE_THIS_WEEK')).toBe('Due this week');
    expect(standingLabel('NOT_SCHEDULED')).toBe('Not scheduled');
    expect(basisLabel('FLOORED')).toBe('At class floor');
    expect(basisLabel('CAPPED')).toBe('At class ceiling');
  });

  it('colours the standings the way the board expects', () => {
    expect(standingTone('OVERDUE')).toBe('bad');
    expect(standingTone('DUE_THIS_WEEK')).toBe('warn');
    expect(standingTone('SCHEDULED')).toBe('ok');
    expect(standingTone('NOT_SCHEDULED')).toBe('unknown');
  });
});

describe('RecallStore', () => {
  let store: RecallStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RecallStore,
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(RecallStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load(entries: RecallEntry[]): void {
    store.load();
    http.expectOne((request) => request.url.endsWith('/recalls')).flush(entries);
    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush({
      horizonDays: 60,
      overdue: entries.filter((e) => e.standing === 'OVERDUE').length,
      unscheduled: 0,
      byStanding: {},
    });
  }

  it('fills the board and the tallies together', () => {
    load([recallEntry('SG-000101', 20, 'OVERDUE'), recallEntry('SG-000102', 20, 'DUE_THIS_WEEK')]);

    expect(store.entries()).toHaveLength(2);
    expect(store.overdue()).toHaveLength(1);
    expect(store.thisWeek()).toHaveLength(1);
    expect(store.summary()?.overdue).toBe(1);
  });

  it('groups by standing to start with', () => {
    load([
      recallEntry('SG-000101', 20, 'OVERDUE'),
      recallEntry('SG-000102', 20, 'OVERDUE'),
      recallEntry('SG-000103', 20, 'SCHEDULED'),
    ]);

    expect(store.groups().map((group) => group.key)).toEqual(['OVERDUE', 'SCHEDULED']);
    expect(store.groups()[0].overdue).toBe(2);
  });

  it('regroups without asking the service again', () => {
    load([
      recallEntry('SG-000101', 20, 'SCHEDULED', { criticality: 'ROUTINE', ...{ locationCode: 'HARLOW-DIM' } }),
      recallEntry('SG-000102', 20, 'SCHEDULED', { criticality: 'ROUTINE', ...{ locationCode: 'CREWE-TOOL' } }),
    ]);

    store.groupBy('location');

    expect(store.groups().map((group) => group.key).sort()).toEqual([
      'CREWE-TOOL',
      'HARLOW-DIM',
    ]);
    http.expectNone((request) => request.url.endsWith('/recalls'));
  });

  it('collects the unplaced and unassigned under one heading', () => {
    load([
      recallEntry('SG-000104', 20, 'SCHEDULED', { criticality: 'ROUTINE', ...{ locationCode: null, custodian: null } }),
    ]);

    store.groupBy('location');
    expect(store.groups()[0].key).toBe('Unplaced');

    store.groupBy('custodian');
    expect(store.groups()[0].key).toBe('Unassigned');
  });

  it('puts the group with the most overdue work first', () => {
    load([
      recallEntry('SG-000101', 20, 'SCHEDULED', { criticality: 'ROUTINE', ...{ classCode: 'CAL-VER' } }),
      recallEntry('SG-000102', 20, 'OVERDUE', { criticality: 'ROUTINE', ...{ classCode: 'GB-SET' } }),
    ]);

    store.groupBy('class');

    expect(store.groups()[0].key).toBe('GB-SET');
  });

  it('filters by criticality without refetching', () => {
    load([
      recallEntry('SG-000101', 20, 'SCHEDULED', { criticality: 'CRITICAL' }),
      recallEntry('SG-000102', 20, 'SCHEDULED', { criticality: 'ROUTINE' }),
    ]);

    store.toggleCriticality('CRITICAL');
    expect(store.entries()).toHaveLength(1);

    store.toggleCriticality('CRITICAL');
    expect(store.entries()).toHaveLength(2);
  });

  it('can show reference standards only', () => {
    load([
      recallEntry('SG-000101', 20, 'SCHEDULED', { criticality: 'ROUTINE', ...{ referenceStandard: true } }),
      recallEntry('SG-000102', 20, 'SCHEDULED'),
    ]);

    store.toggleReferenceOnly();

    expect(store.entries().map((row) => row.assetTag)).toEqual(['SG-000101']);
  });

  it('orders the worst first for the chase list', () => {
    load([
      recallEntry('SG-000101', 20, 'SCHEDULED', { criticality: 'ROUTINE', ...{ daysUntilDue: 30 } }),
      recallEntry('SG-000102', 20, 'OVERDUE', { criticality: 'ROUTINE', ...{ daysUntilDue: -12 } }),
    ]);

    expect(store.worstFirst()[0].assetTag).toBe('SG-000102');
  });

  it('clamps a silly horizon rather than sending it on', () => {
    store.setHorizon(9999);
    http.expectOne((request) => request.url.endsWith('/recalls')).flush([]);
    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush({
      horizonDays: 730,
      overdue: 0,
      unscheduled: 0,
      byStanding: {},
    });

    expect(store.horizon()).toBe(730);
  });

  it('says the board is empty only once loading has finished', () => {
    store.load();
    expect(store.isEmpty()).toBe(false);

    http.expectOne((request) => request.url.endsWith('/recalls')).flush([]);
    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush({
      horizonDays: 60,
      overdue: 0,
      unscheduled: 0,
      byStanding: {},
    });

    expect(store.isEmpty()).toBe(true);
  });

  it('keeps the board usable when only the summary fails', () => {
    store.load();
    http.expectOne((request) => request.url.endsWith('/recalls')).flush([recallEntry('SG-000101', 20, 'OVERDUE')]);
    http
      .expectOne((request) => request.url.endsWith('/recalls/summary'))
      .flush(
        { code: 'registry/internal', status: 500, detail: 'boom', title: 'x', type: 't', timestamp: 'now' },
        { status: 500, statusText: 'Server Error' },
      );

    expect(store.entries()).toHaveLength(1);
    expect(store.summary()).toBeNull();
  });
});
