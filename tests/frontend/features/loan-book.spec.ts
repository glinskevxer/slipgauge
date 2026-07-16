import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  LoanView,
  conditionInWords,
  latenessInWords,
  latenessTone,
  tallyOf,
  worstFirst,
} from '@core/models/loan.model';
import { NotificationService } from '@core/notifications/notification.service';
import { LoanBookComponent } from '@features/loan/loan-book.component';

function loan(id: number, overrides: Partial<LoanView> = {}): LoanView {
  return {
    id,
    assetTag: `SG-000${id}`,
    borrower: 'J Fenwick',
    destination: 'Acme Pressings, Harlow',
    purpose: 'setting a press on site',
    issuedOn: '2025-11-18',
    dueBackOn: '2025-11-25',
    returnedOn: null,
    issuedBy: 'h.whitcombe',
    receivedBy: null,
    conditionOut: 'SERVICEABLE',
    conditionBack: null,
    note: null,
    out: true,
    lateness: -5,
    overdue: false,
    cameBackWorse: false,
    summary: 'J Fenwick, Acme Pressings, Harlow, due back 2025-11-25',
    ...overrides,
  };
}

describe('how a loan reads', () => {
  it('counts down and then up while it is out', () => {
    expect(latenessInWords(loan(1, { lateness: -5 }))).toBe('5 days to go');
    expect(latenessInWords(loan(1, { lateness: -1 }))).toBe('1 day to go');
    expect(latenessInWords(loan(1, { lateness: 0 }))).toBe('due back today');
    expect(latenessInWords(loan(1, { lateness: 3 }))).toBe('3 days overdue');
  });

  it('reads a returned loan in the past tense', () => {
    expect(latenessInWords(loan(1, { out: false, lateness: -2 }))).toBe('back on time');
    expect(latenessInWords(loan(1, { out: false, lateness: 2 }))).toBe('came back 2 days late');
  });

  it('colours only what is still out and past its date', () => {
    expect(latenessTone(loan(1, { overdue: true, lateness: 2 }))).toBe('bad');
    expect(latenessTone(loan(1, { lateness: -1 }))).toBe('warn');
    expect(latenessTone(loan(1, { lateness: -9 }))).toBe('quiet');
    expect(latenessTone(loan(1, { out: false, lateness: 9 }))).toBe('quiet');
  });

  it('colours a returned loan that came back worse', () => {
    expect(latenessTone(loan(1, { out: false, cameBackWorse: true }))).toBe('bad');
  });

  it('says nothing about condition while it is still out', () => {
    expect(conditionInWords(loan(1))).toBeNull();
  });

  it('says both conditions only when they differ', () => {
    expect(conditionInWords(loan(1, { conditionBack: 'SERVICEABLE' }))).toBe(
      'went and came back serviceable',
    );
    expect(conditionInWords(loan(1, { conditionBack: 'DAMAGED' }))).toBe(
      'went out serviceable, came back damaged',
    );
  });
});

describe('ordering and counting the book', () => {
  it('puts the most overdue first', () => {
    const ordered = worstFirst([
      loan(1, { lateness: -5 }),
      loan(2, { lateness: 4, overdue: true }),
      loan(3, { lateness: 1, overdue: true }),
    ]);

    expect(ordered.map((row) => row.id)).toEqual([2, 3, 1]);
  });

  it('counts only what is out', () => {
    expect(
      tallyOf([
        loan(1, { lateness: -2 }),
        loan(2, { lateness: 3, overdue: true }),
        loan(3, { out: false, lateness: 1 }),
        loan(4, { lateness: -20 }),
      ]),
    ).toEqual({ out: 3, overdue: 1, dueThisWeek: 1 });
  });
});

describe('LoanBookComponent', () => {
  let fixture: ComponentFixture<LoanBookComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoanBookComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoanBookComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => http.verify());

  function render(rows: LoanView[]): void {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/loans')).flush(rows);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('lists what is out with who has it', () => {
    render([loan(1), loan(2, { borrower: 'M Kaur' })]);

    expect(fixture.nativeElement.querySelectorAll('.loan')).toHaveLength(2);
    expect(text()).toContain('J Fenwick');
    expect(text()).toContain('Acme Pressings, Harlow');
  });

  it('counts what is out and what is overdue', () => {
    render([loan(1), loan(2, { lateness: 4, overdue: true })]);

    const counts = Array.from(fixture.nativeElement.querySelectorAll('.tile__count')).map(
      (node) => (node as HTMLElement).textContent?.trim(),
    );
    expect(counts).toEqual(['2', '1', '1']);
  });

  it('says so plainly when nothing is out', () => {
    render([]);

    expect(text()).toContain('Nothing is out');
  });

  it('will not book one back in without a condition', () => {
    render([loan(1)]);

    fixture.nativeElement.querySelector('.loan__head').click();
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('.primary') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('books one back in with the condition that was chosen', () => {
    render([loan(1)]);

    fixture.nativeElement.querySelector('.loan__head').click();
    fixture.detectChanges();

    const radios: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.back input'),
    );
    radios[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.primary').click();

    const posted = http.expectOne((call) => call.url.endsWith('/loans/1/return'));
    expect(posted.request.body.conditionBack).toBe('DAMAGED');
    posted.flush(
      loan(1, { out: false, conditionBack: 'DAMAGED', cameBackWorse: true, returnedOn: '2025-11-24' }),
    );

    http.expectOne((call) => call.url.endsWith('/loans')).flush([]);
    fixture.detectChanges();

    expect(notifications.notices()[0].headline).toContain('came back damaged');
  });

  it('offers nothing to do on one that is already back', () => {
    render([loan(1, { out: false, returnedOn: '2025-11-24', conditionBack: 'SERVICEABLE' })]);

    fixture.nativeElement.querySelector('.loan__head').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.back')).toBeNull();
    expect(text()).toContain('went and came back serviceable');
  });

  it('asks for the history when the box is ticked', () => {
    render([loan(1)]);

    const check: HTMLInputElement = fixture.nativeElement.querySelector('.controls__check input');
    check.checked = true;
    check.dispatchEvent(new Event('change'));

    const request = http.expectOne((call) => call.url.endsWith('/loans'));
    expect(request.request.params.get('includeReturned')).toBe('true');
    request.flush([]);
  });

  it('shows a failure where somebody will read it', () => {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/loans')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/internal',
        title: 'INTERNAL',
        status: 500,
        detail: 'the loan book is not answering',
        code: 'registry/internal',
      },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'the loan book is not answering',
    );
  });
});
