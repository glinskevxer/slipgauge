import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  JobSummary,
  awaitingDesk,
  conditionLabel,
  latenessInWords,
  latenessTone,
  nextMove,
  outcomeLabel,
  priorityLabel,
  reviewClauses,
  serviceLabel,
  stateLabel,
} from '@core/models/job.model';
import { NotificationService } from '@core/notifications/notification.service';
import { JobDeskStore } from '@features/jobs/job-desk.store';

function job(reference: string, overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: Number(reference.slice(-4)),
    reference,
    customerCode: 'ACME',
    customerName: 'Acme Pressings',
    state: 'RECEIVED',
    priority: 'STANDARD',
    receivedOn: '2025-11-20',
    promisedOn: '2025-12-04',
    itemCount: 1,
    lateness: -10,
    open: true,
    ...overrides,
  };
}

describe('job labels', () => {
  it('says what the state means rather than what it is called', () => {
    expect(stateLabel('IN_PROGRESS')).toBe('On the bench');
    expect(stateLabel('COMPLETED')).toBe('Ready to go back');
    expect(priorityLabel('SAME_DAY')).toBe('Same day');
    expect(serviceLabel('VERIFICATION')).toBe('Verification');
    expect(conditionLabel('CONTAMINATED')).toBe('Contaminated');
    expect(outcomeLabel('ACCEPTED_WITH_DEVIATION')).toBe('Accepted with a deviation');
  });

  it('falls back to the raw value for something it has never seen', () => {
    expect(stateLabel('SOMETHING_NEW' as never)).toBe('SOMETHING_NEW');
  });
});

describe('how late a job reads', () => {
  it('is quiet while there is time and bad once it is late', () => {
    expect(latenessTone({ lateness: -6, open: true })).toBe('quiet');
    expect(latenessTone({ lateness: -1, open: true })).toBe('warn');
    expect(latenessTone({ lateness: 0, open: true })).toBe('warn');
    expect(latenessTone({ lateness: 3, open: true })).toBe('bad');
  });

  it('drops a finished job back to quiet, or warns when it went out late', () => {
    expect(latenessTone({ lateness: -2, open: false })).toBe('quiet');
    expect(latenessTone({ lateness: 4, open: false })).toBe('warn');
  });

  it('reads the way the desk says it', () => {
    expect(latenessInWords({ lateness: 0, open: true })).toBe('due today');
    expect(latenessInWords({ lateness: 1, open: true })).toBe('1 working day late');
    expect(latenessInWords({ lateness: 3, open: true })).toBe('3 working days late');
    expect(latenessInWords({ lateness: -1, open: true })).toBe('1 working day to go');
    expect(latenessInWords({ lateness: -4, open: false })).toBe('4 working days early');
    expect(latenessInWords({ lateness: 0, open: false })).toBe('on the day');
  });
});

describe('what the desk can do next', () => {
  it('offers the one move the state allows', () => {
    expect(nextMove('ACCEPTED')).toEqual({ action: 'start', label: 'Put on the bench' });
    expect(nextMove('IN_PROGRESS')).toEqual({ action: 'complete', label: 'Mark finished' });
    expect(nextMove('COMPLETED')).toEqual({ action: 'dispatch', label: 'Send it back' });
  });

  it('offers nothing on a state the desk cannot move by itself', () => {
    expect(nextMove('RECEIVED')).toBeNull();
    expect(nextMove('DISPATCHED')).toBeNull();
    expect(nextMove('DECLINED')).toBeNull();
  });

  it('knows which states are waiting on a person rather than a bench', () => {
    expect(awaitingDesk('RECEIVED')).toBe(true);
    expect(awaitingDesk('UNDER_REVIEW')).toBe(true);
    expect(awaitingDesk('COMPLETED')).toBe(true);
    expect(awaitingDesk('IN_PROGRESS')).toBe(false);
  });
});

describe('the review clauses', () => {
  it('reads out in the order they are answered', () => {
    const clauses = reviewClauses({
      outcome: 'ACCEPTED_WITH_DEVIATION',
      reviewedBy: 'a.pereira',
      reviewedOn: '2025-11-21',
      requirementsDefined: true,
      capabilityConfirmed: false,
      methodSelected: true,
      decisionRuleAgreed: true,
      acceptancePolicy: 'MANAGED_RISK',
      methodReference: null,
      findings: ['line 1: reads past what we cover'],
      declinedReason: null,
    });

    expect(clauses.map((clause) => clause.label)).toEqual([
      'Requirements defined',
      'Capability confirmed',
      'Method selected',
      'Decision rule agreed',
    ]);
    expect(clauses.map((clause) => clause.answered)).toEqual([true, false, true, true]);
  });
});

describe('JobDeskStore', () => {
  let store: JobDeskStore;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        JobDeskStore,
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(JobDeskStore);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => http.verify());

  function load(rows: JobSummary[]): void {
    store.load();
    http.expectOne((request) => request.url.endsWith('/jobs')).flush({
      items: rows,
      page: 0,
      size: 200,
      totalItems: rows.length,
      totalPages: 1,
      first: true,
      last: true,
    });
    http.expectOne((request) => request.url.endsWith('/jobs/desk')).flush({
      open: rows.filter((row) => row.open).length,
      awaitingReview: 0,
      onTheBench: 0,
      late: 0,
      dueToday: 0,
      readyToDispatch: 0,
    });
  }

  it('starts empty and not loading', () => {
    expect(store.jobs()).toHaveLength(0);
    expect(store.loading()).toBe(false);
    expect(store.summary()).toBeNull();
  });

  it('loads the list and the counts together', () => {
    load([job('J-2025-0001'), job('J-2025-0002')]);

    expect(store.jobs()).toHaveLength(2);
    expect(store.total()).toBe(2);
    expect(store.summary()?.open).toBe(2);
    expect(store.loading()).toBe(false);
  });

  it('still shows the list when the counts fail', () => {
    store.load();
    http.expectOne((request) => request.url.endsWith('/jobs')).flush({
      items: [job('J-2025-0001')],
      page: 0,
      size: 200,
      totalItems: 1,
      totalPages: 1,
      first: true,
      last: true,
    });
    http
      .expectOne((request) => request.url.endsWith('/jobs/desk'))
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(store.jobs()).toHaveLength(1);
    expect(store.summary()).toBeNull();
  });

  it('filters late work out of the same list rather than asking again', () => {
    load([
      job('J-2025-0001', { lateness: -3 }),
      job('J-2025-0002', { lateness: 2 }),
      job('J-2025-0003', { lateness: 5, open: false }),
    ]);

    store.show('late');
    http.expectOne((request) => request.url.endsWith('/jobs')).flush({
      items: [
        job('J-2025-0001', { lateness: -3 }),
        job('J-2025-0002', { lateness: 2 }),
        job('J-2025-0003', { lateness: 5, open: false }),
      ],
      page: 0,
      size: 200,
      totalItems: 3,
      totalPages: 1,
      first: true,
      last: true,
    });
    http.expectOne((request) => request.url.endsWith('/jobs/desk')).flush({
      open: 2,
      awaitingReview: 0,
      onTheBench: 0,
      late: 1,
      dueToday: 0,
      readyToDispatch: 1,
    });

    expect(store.jobs().map((row) => row.reference)).toEqual(['J-2025-0002']);
  });

  it('asks the service for a state when the lane is a state', () => {
    store.show('onTheBench');

    const request = http.expectOne((call) => call.url.endsWith('/jobs'));
    expect(request.request.params.get('state')).toBe('IN_PROGRESS');
    request.flush({
      items: [],
      page: 0,
      size: 200,
      totalItems: 0,
      totalPages: 0,
      first: true,
      last: true,
    });
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush({
      open: 0,
      awaitingReview: 0,
      onTheBench: 0,
      late: 0,
      dueToday: 0,
      readyToDispatch: 0,
    });
    expect(store.isEmpty()).toBe(true);
  });

  it('does not reload when the lane has not changed', () => {
    load([job('J-2025-0001')]);

    store.show('everything');
    http.verify();
  });

  it('folds a customer code up and sends it', () => {
    store.forCustomer(' acme ');

    const request = http.expectOne((call) => call.url.endsWith('/jobs'));
    expect(request.request.params.get('customer')).toBe('ACME');
    request.flush({
      items: [],
      page: 0,
      size: 200,
      totalItems: 0,
      totalPages: 0,
      first: true,
      last: true,
    });
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush({
      open: 0,
      awaitingReview: 0,
      onTheBench: 0,
      late: 0,
      dueToday: 0,
      readyToDispatch: 0,
    });
    expect(store.customer()).toBe('ACME');
  });

  it('drops a blank customer filter rather than sending an empty one', () => {
    store.forCustomer('   ');

    const request = http.expectOne((call) => call.url.endsWith('/jobs'));
    expect(request.request.params.has('customer')).toBe(false);
    request.flush({
      items: [],
      page: 0,
      size: 200,
      totalItems: 0,
      totalPages: 0,
      first: true,
      last: true,
    });
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush({
      open: 0,
      awaitingReview: 0,
      onTheBench: 0,
      late: 0,
      dueToday: 0,
      readyToDispatch: 0,
    });
    expect(store.customer()).toBeNull();
  });

  it('sorts the worst first', () => {
    load([
      job('J-2025-0001', { lateness: -3, promisedOn: '2025-12-04' }),
      job('J-2025-0002', { lateness: 6, promisedOn: '2025-11-10' }),
      job('J-2025-0003', { lateness: -3, promisedOn: '2025-12-01' }),
    ]);

    expect(store.worstFirst().map((row) => row.reference)).toEqual([
      'J-2025-0002',
      'J-2025-0003',
      'J-2025-0001',
    ]);
  });

  it('picks out what is waiting on a person', () => {
    load([
      job('J-2025-0001', { state: 'RECEIVED' }),
      job('J-2025-0002', { state: 'IN_PROGRESS' }),
      job('J-2025-0003', { state: 'COMPLETED', open: false }),
    ]);

    expect(store.waitingOnUs().map((row) => row.reference)).toEqual([
      'J-2025-0001',
      'J-2025-0003',
    ]);
  });

  it('reloads after a move rather than crossing the job off', () => {
    load([job('J-2025-0001', { state: 'ACCEPTED' })]);

    store.move('J-2025-0001', 'start');
    http
      .expectOne((call) => call.url.endsWith('/jobs/J-2025-0001/start'))
      .flush({ reference: 'J-2025-0001', state: 'IN_PROGRESS' });

    expect(notifications.notices()[0].headline).toContain('is now in_progress');

    http.expectOne((call) => call.url.endsWith('/jobs')).flush({
      items: [job('J-2025-0001', { state: 'IN_PROGRESS' })],
      page: 0,
      size: 200,
      totalItems: 1,
      totalPages: 1,
      first: true,
      last: true,
    });
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush({
      open: 1,
      awaitingReview: 0,
      onTheBench: 1,
      late: 0,
      dueToday: 0,
      readyToDispatch: 0,
    });

    expect(store.jobs()[0].state).toBe('IN_PROGRESS');
  });

  it('leaves the list alone and raises a notice when a move is refused', () => {
    load([job('J-2025-0001', { state: 'IN_PROGRESS' })]);

    store.move('J-2025-0001', 'complete');
    http.expectOne((call) => call.url.endsWith('/jobs/J-2025-0001/complete')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/rule-violation',
        title: 'RULE_VIOLATION',
        status: 422,
        detail: 'line 1 has no certificate filed since the job arrived',
        code: 'registry/rule-violation',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(store.jobs()[0].state).toBe('IN_PROGRESS');
    expect(notifications.count()).toBe(1);
  });

  it('keeps the error where the screen can show it when the list fails', () => {
    store.load();
    http.expectOne((call) => call.url.endsWith('/jobs')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/internal',
        title: 'INTERNAL',
        status: 500,
        detail: 'something went wrong',
        code: 'registry/internal',
      },
      { status: 500, statusText: 'Server Error' },
    );
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush({
      open: 0,
      awaitingReview: 0,
      onTheBench: 0,
      late: 0,
      dueToday: 0,
      readyToDispatch: 0,
    });

    expect(store.error()?.message).toBe('something went wrong');
    expect(store.loading()).toBe(false);
  });
});
