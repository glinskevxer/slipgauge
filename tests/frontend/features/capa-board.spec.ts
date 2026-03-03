import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  CapaSummary,
  NonconformanceView,
  awaitingStage,
  closeable,
  latenessInWords,
  latenessTone,
  progressOf,
  severityTone,
  sourceLabel,
  stageLabel,
  stageRoute,
} from '@core/models/nonconformity.model';
import { CapaBoardComponent } from '@features/nonconformity/capa-board.component';

function record(overrides: Partial<NonconformanceView> = {}): NonconformanceView {
  return {
    id: 1,
    reference: 'NC-2025-001',
    raisedOn: '2025-11-20',
    raisedBy: 'r.okonjo',
    source: 'EXCURSION',
    sourceRef: '41',
    title: 'HARLOW-DIM outside its band',
    detail: 'The chiller tripped overnight.',
    severity: 'MEDIUM',
    state: 'RAISED',
    owner: null,
    dueOn: '2026-01-01',
    containment: null,
    containedOn: null,
    rootCause: null,
    causeFoundOn: null,
    correctiveAction: null,
    actionTakenOn: null,
    effectiveness: null,
    effectivenessOn: null,
    closedOn: null,
    closedBy: null,
    open: true,
    lateness: -42,
    escalate: false,
    answersGiven: 0,
    closesFrom: 'ACTION_TAKEN',
    ...overrides,
  };
}

const SUMMARY: CapaSummary = {
  open: 2,
  late: 1,
  escalating: 1,
  high: 1,
  closedThisYear: 6,
  byStage: { RAISED: 1, CONTAINED: 1 },
};

describe('nonconformance labels', () => {
  it('reads the stages and sources in words', () => {
    expect(stageLabel('CAUSE_FOUND')).toBe('Cause found');
    expect(sourceLabel('OUT_OF_TOLERANCE')).toBe('Out of tolerance');
    expect(sourceLabel('EXCURSION')).toBe('Room excursion');
  });

  it('knows the route each stage posts to, and that two of them have none', () => {
    expect(stageRoute('CONTAINED')).toBe('containment');
    expect(stageRoute('EFFECTIVENESS_CHECKED')).toBe('effectiveness');
    expect(stageRoute('CLOSED')).toBeNull();
    expect(stageRoute('ABANDONED')).toBeNull();
  });

  it('colours the severities', () => {
    expect(severityTone('HIGH')).toBe('bad');
    expect(severityTone('MEDIUM')).toBe('warn');
    expect(severityTone('LOW')).toBe('quiet');
  });
});

describe('what a record is waiting for', () => {
  it('names the next stage', () => {
    expect(awaitingStage(record())).toBe('CONTAINED');
    expect(awaitingStage(record({ state: 'ACTION_TAKEN' }))).toBe('EFFECTIVENESS_CHECKED');
  });

  it('waits for nothing once it is closed or abandoned', () => {
    expect(awaitingStage(record({ state: 'CLOSED', open: false }))).toBeNull();
    expect(awaitingStage(record({ state: 'ABANDONED', open: false }))).toBeNull();
  });
});

describe('whether a record can be closed', () => {
  it('lets a medium one close once the action is taken', () => {
    expect(closeable(record({ state: 'ACTION_TAKEN' }))).toBe(true);
    expect(closeable(record({ state: 'CAUSE_FOUND' }))).toBe(false);
  });

  it('makes a high one reach the effectiveness check', () => {
    const high = { severity: 'HIGH' as const, closesFrom: 'EFFECTIVENESS_CHECKED' as const };

    expect(closeable(record({ ...high, state: 'ACTION_TAKEN' }))).toBe(false);
    expect(closeable(record({ ...high, state: 'EFFECTIVENESS_CHECKED' }))).toBe(true);
  });

  it('never offers to close one that is already finished', () => {
    expect(closeable(record({ state: 'CLOSED', open: false }))).toBe(false);
  });
});

describe('how far along a record is', () => {
  it('measures against what its own severity needs', () => {
    expect(progressOf(record({ state: 'RAISED' }))).toBe(0);
    expect(progressOf(record({ state: 'CONTAINED' }))).toBeCloseTo(1 / 3, 5);
    expect(progressOf(record({ state: 'ACTION_TAKEN' }))).toBe(1);
  });

  it('does not show a low severity record as unfinished when it is finished', () => {
    const low = record({ severity: 'LOW', closesFrom: 'ACTION_TAKEN', state: 'ACTION_TAKEN' });

    expect(progressOf(low)).toBe(1);
  });

  it('never goes past one', () => {
    expect(progressOf(record({ state: 'CLOSED', open: false }))).toBe(1);
  });
});

describe('how late a record reads', () => {
  it('counts down and then up', () => {
    expect(latenessInWords(record({ lateness: -3 }))).toBe('3 days left');
    expect(latenessInWords(record({ lateness: 0 }))).toBe('due today');
    expect(latenessInWords(record({ lateness: 1 }))).toBe('1 day late');
  });

  it('says so when there is no date at all', () => {
    expect(latenessInWords(record({ dueOn: null }))).toBe('no date set');
  });

  it('reads a closed one in the past tense', () => {
    expect(latenessInWords(record({ open: false, lateness: -2 }))).toBe('closed in time');
    expect(latenessInWords(record({ open: false, lateness: 0 }))).toBe('on the day');
  });

  it('colours an escalating one badly and a closed one quietly', () => {
    expect(latenessTone(record({ escalate: true }))).toBe('bad');
    expect(latenessTone(record({ lateness: 2 }))).toBe('warn');
    expect(latenessTone(record({ lateness: -9 }))).toBe('quiet');
    expect(latenessTone(record({ open: false, escalate: true }))).toBe('quiet');
  });
});

describe('CapaBoardComponent', () => {
  let fixture: ComponentFixture<CapaBoardComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CapaBoardComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CapaBoardComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(rows: NonconformanceView[], summary: CapaSummary = SUMMARY): void {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/nonconformities')).flush(rows);
    http.expectOne((call) => call.url.endsWith('/nonconformities/summary')).flush(summary);
    fixture.detectChanges();
  }

  function reload(rows: NonconformanceView[]): void {
    http.expectOne((call) => call.url.endsWith('/nonconformities')).flush(rows);
    http.expectOne((call) => call.url.endsWith('/nonconformities/summary')).flush(SUMMARY);
    fixture.detectChanges();
  }

  function openFirst(): void {
    fixture.nativeElement.querySelector('.record__head').click();
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('lists what is open with its stage and its severity', () => {
    render([record(), record({ id: 2, reference: 'NC-2025-002', severity: 'HIGH' })]);

    expect(fixture.nativeElement.querySelectorAll('.record')).toHaveLength(2);
    expect(text()).toContain('NC-2025-001');
    expect(text()).toContain('Room excursion');
    expect(text()).toContain('Raised');
  });

  it('puts the counts on the stage tabs', () => {
    render([record()]);

    const counts = Array.from(fixture.nativeElement.querySelectorAll('.stage__count')).map(
      (node) => (node as HTMLElement).textContent?.trim(),
    );
    expect(counts).toEqual(['1', '1', '0', '0', '0']);
  });

  it('offers only the next stage on the record that is open', () => {
    render([record()]);
    openFirst();

    const labels = Array.from(fixture.nativeElement.querySelectorAll('.field')).map((node) =>
      (node as HTMLElement).textContent?.trim().split('\n')[0].trim(),
    );
    expect(labels).toContain('Contained');
    expect(labels).not.toContain('Cause found');
  });

  it('records the answer for the stage it is at', () => {
    render([record()]);
    openFirst();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[name="answer"]');
    input.value = 'work in the room stopped';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.primary').click();

    const posted = http.expectOne((call) => call.url.endsWith('/containment'));
    expect(posted.request.body).toEqual({ text: 'work in the room stopped' });
    posted.flush(record({ state: 'CONTAINED', containment: 'work in the room stopped' }));

    reload([record({ state: 'CONTAINED', containment: 'work in the room stopped', answersGiven: 1 })]);

    expect(text()).toContain('work in the room stopped');
  });

  it('shows every answer written so far and says which are missing', () => {
    render([
      record({
        state: 'CAUSE_FOUND',
        containment: 'work stopped',
        containedOn: '2025-11-21',
        rootCause: 'no service contract',
        causeFoundOn: '2025-11-22',
      }),
    ]);
    openFirst();

    expect(text()).toContain('work stopped');
    expect(text()).toContain('no service contract');
    expect(fixture.nativeElement.querySelectorAll('.answers--empty')).toHaveLength(2);
  });

  it('says why a high severity record cannot be closed yet', () => {
    render([
      record({
        severity: 'HIGH',
        closesFrom: 'EFFECTIVENESS_CHECKED',
        state: 'ACTION_TAKEN',
      }),
    ]);
    openFirst();

    expect(text()).toContain('cannot close until effectiveness checked');
  });

  it('offers to close one that has done enough', () => {
    render([record({ state: 'ACTION_TAKEN' })]);
    openFirst();

    const close: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((node) => (node as HTMLButtonElement).textContent?.includes('Close NC-2025-001')) as HTMLButtonElement;

    expect(close).toBeTruthy();
    close.click();

    http
      .expectOne((call) => call.url.endsWith('/closure'))
      .flush(record({ state: 'CLOSED', open: false }));
    reload([]);

    expect(text()).toContain('Nothing outstanding');
  });

  it('offers to assign an owner only while nobody owns it', () => {
    render([record({ owner: 'h.whitcombe' })]);
    openFirst();

    expect(fixture.nativeElement.querySelector('input[name="owner"]')).toBeNull();
    expect(text()).toContain('owned by h.whitcombe');
  });

  it('assigns an owner', () => {
    render([record()]);
    openFirst();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[name="owner"]');
    input.value = 'h.whitcombe';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.panel__do button'),
    );
    (buttons.find((node) => node.textContent?.trim() === 'Assign') as HTMLButtonElement).click();

    const posted = http.expectOne((call) => call.url.endsWith('/assignment'));
    expect(posted.request.body).toEqual({ owner: 'h.whitcombe' });
    posted.flush(record({ owner: 'h.whitcombe' }));
    reload([record({ owner: 'h.whitcombe' })]);

    expect(text()).toContain('owned by h.whitcombe');
  });

  it('will not abandon without a reason', () => {
    render([record()]);
    openFirst();

    const abandon: HTMLButtonElement = fixture.nativeElement.querySelector('.danger');
    expect(abandon.disabled).toBe(true);
  });

  it('filters by stage', () => {
    render([record()]);

    const tabs: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.stage'));
    tabs[2].click();

    const request = http.expectOne((call) => call.url.endsWith('/nonconformities'));
    expect(request.request.params.get('state')).toBe('CONTAINED');
    request.flush([]);
    http.expectOne((call) => call.url.endsWith('/nonconformities/summary')).flush(SUMMARY);
  });

  it('asks for the closed ones when the box is ticked', () => {
    render([record()]);

    const check: HTMLInputElement = fixture.nativeElement.querySelector('.stages__closed input');
    check.checked = true;
    check.dispatchEvent(new Event('change'));

    const request = http.expectOne((call) => call.url.endsWith('/nonconformities'));
    expect(request.request.params.get('includeClosed')).toBe('true');
    request.flush([]);
    http.expectOne((call) => call.url.endsWith('/nonconformities/summary')).flush(SUMMARY);
  });

  it('shows a failure where somebody will read it', () => {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/nonconformities')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/internal',
        title: 'INTERNAL',
        status: 500,
        detail: 'the register is not answering',
        code: 'registry/internal',
      },
      { status: 500, statusText: 'Server Error' },
    );
    http.expectOne((call) => call.url.endsWith('/nonconformities/summary')).flush(SUMMARY);
    fixture.detectChanges();

    expect(text()).toContain('the register is not answering');
  });
});
