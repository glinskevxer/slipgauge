import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  ManagementReview,
  isQuiet,
  lastCalendarYear,
  periodInWords,
  sectionsOf,
} from '@core/models/review.model';
import { ReviewPackComponent } from '@features/review/review-pack.component';

function pack(overrides: Partial<ManagementReview> = {}): ManagementReview {
  return {
    period: { from: '2025-01-01', to: '2025-12-31' },
    preparedOn: '2026-01-06',
    scope: {
      liveLines: 12,
      lapsedInPeriod: 0,
      disciplinesCovered: ['DIMENSIONAL', 'MASS'],
      workedButUnaccredited: [],
    },
    capa: {
      raised: 4,
      closed: 5,
      openAtEnd: 1,
      overdueAtEnd: 0,
      bySource: { EXCURSION: 2, COMPLAINT: 2 },
      medianDaysToClose: 12,
    },
    proficiency: {
      roundsScored: 2,
      satisfactory: 4,
      questionable: 1,
      unsatisfactory: 0,
      outstanding: 1,
    },
    resources: {
      instrumentsInService: 120,
      referenceStandards: 6,
      overdue: 2,
      quarantined: 0,
      peopleAuthorised: 5,
      authorisationsExpiringSoon: 1,
      disciplinesWithoutAnApprover: [],
    },
    workload: {
      jobsReceived: 90,
      jobsDispatched: 88,
      lateOnDispatch: 3,
      certificatesIssued: 300,
      certificatesWithdrawn: 1,
      outOfToleranceFound: 7,
    },
    environment: {
      excursions: 2,
      major: 0,
      unassessed: 0,
      certificatesPutInQuestion: 0,
    },
    talkingPoints: ['2 instrument(s) are past their recall date.', '3 job(s) went back late.'],
    ...overrides,
  };
}

describe('laying the pack out', () => {
  it('has a section for every clause the standard lists', () => {
    const sections = sectionsOf(pack());

    expect(sections.map((section) => section.clause)).toEqual([
      '8.9.2 b',
      '8.9.2 d',
      '8.9.2 f',
      '8.9.2 h',
      '8.9.2 i',
      '8.9.2 j',
    ]);
  });

  it('colours a count that should be zero and leaves the rest quiet', () => {
    const resources = sectionsOf(pack()).find((section) => section.heading === 'Resources');

    expect(resources?.figures.find((f) => f.label === 'past their recall date')?.tone).toBe('bad');
    expect(resources?.figures.find((f) => f.label === 'reference standards')?.tone).toBe('quiet');
  });

  it('never colours a count that is naturally large', () => {
    const workload = sectionsOf(pack()).find((section) => section.heading === 'Customer work');

    expect(workload?.figures.find((f) => f.label === 'certificates issued')?.tone).toBe('quiet');
    expect(workload?.figures.find((f) => f.label === 'jobs received')?.tone).toBe('quiet');
  });

  it('says so rather than showing nothing when none were closed', () => {
    const capa = sectionsOf(pack({ capa: { ...pack().capa, medianDaysToClose: null } })).find(
      (section) => section.heading === 'Corrective action',
    );

    expect(capa?.figures.find((f) => f.label === 'median days to close')?.value).toBe(
      'none closed',
    );
  });
});

describe('the period', () => {
  it('reads the way the minutes do', () => {
    expect(periodInWords({ from: '2025-01-01', to: '2025-12-31' })).toBe(
      '2025-01-01 to 2025-12-31',
    );
  });

  it('opens on the last complete calendar year', () => {
    expect(lastCalendarYear('2026-03-04')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(lastCalendarYear('2026-01-01')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
});

describe('whether the pack is quiet', () => {
  it('is quiet only on the standing note', () => {
    expect(
      isQuiet(pack({ talkingPoints: ['Nothing in the register raised itself for this meeting.'] })),
    ).toBe(true);
    expect(isQuiet(pack())).toBe(false);
  });

  it('is not quiet when the standing note sits beside something else', () => {
    expect(
      isQuiet(
        pack({
          talkingPoints: [
            'Nothing in the register raised itself for this meeting.',
            'Something else.',
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('ReviewPackComponent', () => {
  let fixture: ComponentFixture<ReviewPackComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewPackComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewPackComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(body: ManagementReview = pack()): void {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/management-review')).flush(body);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('asks for the last complete calendar year', () => {
    fixture.detectChanges();

    const request = http.expectOne((call) => call.url.endsWith('/management-review'));
    expect(request.request.params.get('from')).toMatch(/^\d{4}-01-01$/);
    expect(request.request.params.get('to')).toMatch(/^\d{4}-12-31$/);
    request.flush(pack());
  });

  it('lists what the register raised, in order', () => {
    render();

    const points = Array.from(fixture.nativeElement.querySelectorAll('.points__list li')).map(
      (node) => (node as HTMLElement).textContent?.trim(),
    );
    expect(points).toEqual([
      '2 instrument(s) are past their recall date.',
      '3 job(s) went back late.',
    ]);
  });

  it('says so plainly when nothing was raised', () => {
    render(pack({ talkingPoints: ['Nothing in the register raised itself for this meeting.'] }));

    expect(fixture.nativeElement.querySelector('.points__list')).toBeNull();
    expect(text()).toContain('Nothing in the register raised itself');
  });

  it('draws a section per clause with its numbers', () => {
    render();

    expect(fixture.nativeElement.querySelectorAll('.figures')).toHaveLength(6);
    expect(text()).toContain('8.9.2 d');
    expect(text()).toContain('median days to close');
  });

  it('marks the figures that should be zero', () => {
    render();

    const bad = Array.from(fixture.nativeElement.querySelectorAll('.figure--bad dt')).map((node) =>
      (node as HTMLElement).textContent?.trim(),
    );
    expect(bad).toEqual(
      expect.arrayContaining(['past their recall date', 'went back late', 'certificates withdrawn']),
    );
  });

  it('rebuilds on a different period', () => {
    render();

    const inputs: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.pack__field input'),
    );
    inputs[0].value = '2024-01-01';
    inputs[1].value = '2024-12-31';

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.pack__controls button'),
    );
    buttons[0].click();

    const request = http.expectOne((call) => call.url.endsWith('/management-review'));
    expect(request.request.params.get('from')).toBe('2024-01-01');
    request.flush(pack({ period: { from: '2024-01-01', to: '2024-12-31' } }));
    fixture.detectChanges();

    expect(text()).toContain('2024-01-01 to 2024-12-31');
  });

  it('ignores a period that ends before it starts', () => {
    render();

    const inputs: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.pack__field input'),
    );
    inputs[0].value = '2025-12-31';
    inputs[1].value = '2025-01-01';

    (fixture.nativeElement.querySelector('.pack__controls button') as HTMLButtonElement).click();
    http.verify();
  });

  it('shows a failure where somebody will read it', () => {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/management-review')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/forbidden',
        title: 'FORBIDDEN',
        status: 403,
        detail: 'your role does not allow that',
        code: 'registry/forbidden',
      },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'your role does not allow that',
    );
  });
});
