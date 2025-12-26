import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { JobDeskSummary, JobSummary } from '@core/models/job.model';
import { JobDeskComponent } from '@features/jobs/job-desk.component';

function job(reference: string, overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: Number(reference.slice(-4)),
    reference,
    customerCode: 'ACME',
    customerName: 'Acme Pressings',
    state: 'ACCEPTED',
    priority: 'STANDARD',
    receivedOn: '2025-11-20',
    promisedOn: '2025-12-04',
    itemCount: 2,
    lateness: -6,
    open: true,
    ...overrides,
  };
}

const QUIET: JobDeskSummary = {
  open: 1,
  awaitingReview: 0,
  onTheBench: 1,
  late: 0,
  dueToday: 0,
  readyToDispatch: 0,
};

describe('JobDeskComponent', () => {
  let fixture: ComponentFixture<JobDeskComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JobDeskComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JobDeskComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(rows: JobSummary[], summary: JobDeskSummary = QUIET): void {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/jobs')).flush({
      items: rows,
      page: 0,
      size: 200,
      totalItems: rows.length,
      totalPages: 1,
      first: true,
      last: true,
    });
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush(summary);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('loads the desk as soon as it is shown', () => {
    render([job('J-2025-0001')]);

    expect(text()).toContain('Job desk');
    expect(text()).toContain('J-2025-0001');
    expect(text()).toContain('Acme Pressings');
  });

  it('says how many jobs it is showing out of how many there are', () => {
    render([job('J-2025-0001'), job('J-2025-0002')]);

    expect(text()).toContain('2 of 2 jobs');
  });

  it('offers the one move the state allows and nothing on a job it cannot move', () => {
    render([job('J-2025-0001', { state: 'ACCEPTED' }), job('J-2025-0002', { state: 'RECEIVED' })]);

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.jobs__do button'),
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent?.trim()).toBe('Put on the bench');
  });

  it('sends the move and reloads when the button is used', () => {
    render([job('J-2025-0001', { state: 'IN_PROGRESS' })]);

    fixture.nativeElement.querySelector('.jobs__do button').click();

    http
      .expectOne((call) => call.url.endsWith('/jobs/J-2025-0001/complete'))
      .flush({ reference: 'J-2025-0001', state: 'COMPLETED' });
    http.expectOne((call) => call.url.endsWith('/jobs')).flush({
      items: [job('J-2025-0001', { state: 'COMPLETED', open: false })],
      page: 0,
      size: 200,
      totalItems: 1,
      totalPages: 1,
      first: true,
      last: true,
    });
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush(QUIET);
    fixture.detectChanges();

    expect(text()).toContain('Ready to go back');
  });

  it('flags a priority job and leaves a standard one unmarked', () => {
    render([
      job('J-2025-0001', { priority: 'SAME_DAY' }),
      job('J-2025-0002', { priority: 'STANDARD' }),
    ]);

    const flags = fixture.nativeElement.querySelectorAll('.flag');
    expect(flags).toHaveLength(1);
    expect(flags[0].textContent.trim()).toBe('Same day');
  });

  it('colours a late job and leaves one with time to go quiet', () => {
    render([job('J-2025-0001', { lateness: 4 }), job('J-2025-0002', { lateness: -6 })]);

    expect(fixture.nativeElement.querySelectorAll('.standing--bad')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.standing--quiet')).toHaveLength(1);
    expect(text()).toContain('4 working days late');
  });

  it('puts the counts on the lane tabs', () => {
    render([job('J-2025-0001')], {
      open: 7,
      awaitingReview: 2,
      onTheBench: 3,
      late: 1,
      dueToday: 0,
      readyToDispatch: 4,
    });

    const counts = Array.from(fixture.nativeElement.querySelectorAll('.lane__count')).map(
      (node) => (node as HTMLElement).textContent?.trim(),
    );
    expect(counts).toEqual(['7', '2', '3', '4', '1']);
  });

  it('marks the lane that is showing', () => {
    render([job('J-2025-0001')]);

    const on = fixture.nativeElement.querySelector('.lane--on');
    expect(on.textContent).toContain('Everything open');
    expect(on.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches lane and asks the service again', () => {
    render([job('J-2025-0001')]);

    const lanes: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.lane'));
    lanes[2].click();

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
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush(QUIET);
    fixture.detectChanges();

    expect(text()).toContain('Nothing in this lane');
  });

  it('offers to clear a customer filter once one is on', () => {
    render([job('J-2025-0001')]);

    expect(fixture.nativeElement.querySelector('.filter__clear')).toBeNull();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('.filter__field input');
    input.value = 'acme';
    input.dispatchEvent(new Event('change'));

    http.expectOne((call) => call.url.endsWith('/jobs')).flush({
      items: [],
      page: 0,
      size: 200,
      totalItems: 0,
      totalPages: 0,
      first: true,
      last: true,
    });
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush(QUIET);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.filter__clear').textContent).toContain(
      'Clear ACME',
    );
  });

  it('shows the failure where somebody will read it', () => {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/jobs')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/internal',
        title: 'INTERNAL',
        status: 500,
        detail: 'the desk is not answering',
        code: 'registry/internal',
      },
      { status: 500, statusText: 'Server Error' },
    );
    http.expectOne((call) => call.url.endsWith('/jobs/desk')).flush(QUIET);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('the desk is not answering');
  });
});
