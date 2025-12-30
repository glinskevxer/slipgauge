import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { ContractReviewView, JobItemView, JobView, LineProgress } from '@core/models/job.model';
import { NotificationService } from '@core/notifications/notification.service';
import { JobSheetComponent } from '@features/jobs/job-sheet.component';

function line(overrides: Partial<JobItemView> = {}): JobItemView {
  return {
    id: 1,
    lineNumber: 1,
    service: 'CALIBRATION',
    description: 'external micrometer 0-25',
    manufacturer: 'Mitutoyo',
    model: '103-137',
    serialNumber: '81104321',
    classCode: 'MIC-EXT',
    className: 'External micrometer',
    condition: 'SERVICEABLE',
    accessories: null,
    note: null,
    rangeHigh: 25,
    toleranceStated: true,
    assetTag: null,
    calibratable: true,
    ...overrides,
  };
}

function job(overrides: Partial<JobView> = {}): JobView {
  return {
    id: 1,
    reference: 'J-2025-0142',
    customerCode: 'ACME',
    customerName: 'Acme Pressings',
    state: 'RECEIVED',
    priority: 'STANDARD',
    receivedOn: '2025-11-20',
    promisedOn: '2025-12-04',
    completedOn: null,
    dispatchedOn: null,
    receivedBy: 'h.whitcombe',
    customerOrder: null,
    instructions: null,
    items: [line()],
    review: null,
    lateness: -10,
    open: true,
    ...overrides,
  };
}

const CLEAN_REVIEW: ContractReviewView = {
  outcome: 'ACCEPTED',
  reviewedBy: 'a.pereira',
  reviewedOn: '2025-11-21',
  requirementsDefined: true,
  capabilityConfirmed: true,
  methodSelected: true,
  decisionRuleAgreed: true,
  acceptancePolicy: 'MANAGED_RISK',
  methodReference: 'SLP-WI-014',
  findings: [],
  declinedReason: null,
};

describe('JobSheetComponent', () => {
  let fixture: ComponentFixture<JobSheetComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JobSheetComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ reference: 'J-2025-0142' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JobSheetComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => http.verify());

  function render(
    view: JobView,
    progress: LineProgress[] = [],
    preview: Record<string, unknown> | null = null,
  ): void {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/jobs/J-2025-0142')).flush(view);
    http.expectOne((call) => call.url.endsWith('/jobs/J-2025-0142/progress')).flush(progress);

    if (view.state === 'RECEIVED' || view.state === 'UNDER_REVIEW') {
      http
        .expectOne((call) => call.url.includes('/review/preview'))
        .flush(
          preview ?? {
            reference: view.reference,
            outcome: 'ACCEPTED',
            findings: [],
            acceptable: true,
            decisionRulePending: true,
          },
        );
    }
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('reads the job out with its customer and its promise', () => {
    render(job());

    expect(text()).toContain('J-2025-0142');
    expect(text()).toContain('Acme Pressings (ACME)');
    expect(text()).toContain('10 working days to go');
  });

  it('lists what came in, with the register column empty until it is accepted', () => {
    render(job());

    expect(text()).toContain('external micrometer 0-25');
    expect(text()).toContain('s/n 81104321');
    expect(text()).toContain('not raised');
  });

  it('shows the review panel to fill in while the job is waiting on one', () => {
    render(job());

    expect(text()).toContain('Nothing stands against this job');
    expect(fixture.nativeElement.querySelector('.rules')).not.toBeNull();
  });

  it('lists the findings the preview raised, coloured by severity', () => {
    render(job(), [], {
      reference: 'J-2025-0142',
      outcome: 'ACCEPTED_WITH_DEVIATION',
      findings: [
        {
          clause: 'CAPABILITY',
          severity: 'DEVIATION',
          lineNumber: 1,
          detail: 'reads to 925, the laboratory covers 100',
        },
      ],
      acceptable: true,
      decisionRulePending: true,
    });

    expect(text()).toContain('the laboratory covers 100');
    expect(fixture.nativeElement.querySelectorAll('.finding--deviation')).toHaveLength(1);
  });

  it('re-previews under a rule when one is chosen', () => {
    render(job());

    const radios: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.rules input'),
    );
    radios[2].dispatchEvent(new Event('change'));

    const request = http.expectOne((call) => call.url.includes('/review/preview'));
    expect(request.request.params.get('policy')).toBe('SHARED_RISK');
    request.flush({
      reference: 'J-2025-0142',
      outcome: 'ACCEPTED',
      findings: [],
      acceptable: true,
      decisionRulePending: false,
    });
  });

  it('will not record a review before a rule has been chosen', () => {
    render(job());

    fixture.nativeElement.querySelector('.panel__do button').click();

    expect(notifications.notices()[0].headline).toBe('Choose a decision rule first');
  });

  it('records the review with the chosen rule and the typed method', () => {
    render(job());

    const radios: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.rules input'),
    );
    radios[0].dispatchEvent(new Event('change'));
    http.expectOne((call) => call.url.includes('/review/preview')).flush({
      reference: 'J-2025-0142',
      outcome: 'ACCEPTED',
      findings: [],
      acceptable: true,
      decisionRulePending: false,
    });
    fixture.detectChanges();

    const method: HTMLInputElement = fixture.nativeElement.querySelector('input[name="method"]');
    method.value = 'SLP-WI-014';
    method.dispatchEvent(new Event('input'));

    fixture.nativeElement.querySelector('.panel__do button').click();

    const posted = http.expectOne((call) => call.url.endsWith('/jobs/J-2025-0142/review'));
    expect(posted.request.body).toEqual({
      acceptancePolicy: 'MANAGED_RISK',
      methodReference: 'SLP-WI-014',
    });
    posted.flush(job({ state: 'ACCEPTED', review: CLEAN_REVIEW, items: [line({ assetTag: 'SG-0042' })] }));
    http.expectOne((call) => call.url.endsWith('/progress')).flush([]);
    fixture.detectChanges();

    expect(text()).toContain('Accepted by a.pereira');
    expect(text()).toContain('SG-0042');
  });

  it('reads the recorded review back with its four clauses', () => {
    render(
      job({
        state: 'ACCEPTED',
        review: { ...CLEAN_REVIEW, capabilityConfirmed: false, outcome: 'ACCEPTED_WITH_DEVIATION' },
      }),
    );

    expect(text()).toContain('Accepted with a deviation');
    expect(fixture.nativeElement.querySelectorAll('.clauses li')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.clauses__no')).toHaveLength(1);
  });

  it('will not decline without a reason', () => {
    render(job());

    const decline: HTMLButtonElement = fixture.nativeElement.querySelector('.danger');
    expect(decline.disabled).toBe(true);
  });

  it('declines with the typed reason', () => {
    render(job());

    const reason: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="declineReason"]',
    );
    reason.value = 'customer will not confirm the drawing';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.danger').click();

    const posted = http.expectOne((call) => call.url.endsWith('/decline'));
    expect(posted.request.body).toEqual({ reason: 'customer will not confirm the drawing' });
    posted.flush(
      job({
        state: 'DECLINED',
        open: false,
        review: {
          ...CLEAN_REVIEW,
          outcome: 'DECLINED',
          acceptancePolicy: null,
          declinedReason: 'customer will not confirm the drawing',
        },
      }),
    );
    fixture.detectChanges();

    expect(text()).toContain('customer will not confirm the drawing');
  });

  it('says how many lines are holding a finished job up', () => {
    render(
      job({ state: 'IN_PROGRESS', review: CLEAN_REVIEW }),
      [
        { lineNumber: 1, assetTag: 'SG-0042', certificateNumber: null, done: false, reason: 'has no certificate filed since the job arrived' },
        { lineNumber: 2, assetTag: 'SG-0043', certificateNumber: 'CAL-9', done: true, reason: null },
      ],
    );

    expect(text()).toContain('Mark finished');
    expect(text()).toContain('1 line(s) still have no certificate');
    expect(fixture.nativeElement.querySelectorAll('.progress--done')).toHaveLength(1);
  });

  it('drops the warning once every line is certified', () => {
    render(job({ state: 'IN_PROGRESS', review: CLEAN_REVIEW }), [
      { lineNumber: 1, assetTag: 'SG-0042', certificateNumber: 'CAL-9', done: true, reason: null },
    ]);

    expect(text()).not.toContain('still have no certificate');
  });

  it('says so plainly when the job is not there', () => {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/jobs/J-2025-0142')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/not-found',
        title: 'NOT_FOUND',
        status: 404,
        detail: 'job J-2025-0142 does not exist',
        code: 'registry/not-found',
      },
      { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();

    expect(text()).toContain('That job is not here');
  });
});
