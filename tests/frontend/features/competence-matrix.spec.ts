import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  CompetenceMatrix,
  CompetenceView,
  cellTone,
  daysUntil,
  depthOf,
  levelLabel,
  levelMark,
  remainingInWords,
  rowFor,
  spanInWords,
  withoutAnApprover,
} from '@core/models/competence.model';
import { CompetenceMatrixComponent } from '@features/competence/competence-matrix.component';

const MATRIX: CompetenceMatrix = {
  people: ['a.pereira', 'r.okonjo'],
  disciplines: ['DIMENSIONAL', 'TORQUE', 'MASS'],
  cells: [
    {
      person: 'r.okonjo',
      discipline: 'DIMENSIONAL',
      level: 'AUTHORISED',
      expiresOn: '2026-12-31',
      grants: 1,
    },
    {
      person: 'a.pereira',
      discipline: 'DIMENSIONAL',
      level: 'APPROVER',
      expiresOn: '2026-01-05',
      grants: 2,
    },
    { person: 'a.pereira', discipline: 'TORQUE', level: 'TRAINEE', expiresOn: null, grants: 1 },
  ],
};

function grant(overrides: Partial<CompetenceView> = {}): CompetenceView {
  return {
    id: 1,
    person: 'r.okonjo',
    discipline: 'DIMENSIONAL',
    classCode: null,
    className: null,
    level: 'AUTHORISED',
    rangeLow: null,
    rangeHigh: null,
    authorisedFrom: '2025-01-01',
    authorisedTo: '2026-12-31',
    grantedBy: 'h.whitcombe',
    evidence: null,
    withdrawn: false,
    withdrawnReason: null,
    live: true,
    daysRemaining: 406,
    ...overrides,
  };
}

describe('competence labels', () => {
  it('says what a level means and marks it short enough to fit a cell', () => {
    expect(levelLabel('APPROVER')).toBe('Approves');
    expect(levelLabel(null)).toBe('Nothing held');
    expect(levelMark('TRAINEE')).toBe('T');
    expect(levelMark(null)).toBe('');
  });

  it('reads the remaining time the way somebody chasing a renewal would', () => {
    expect(remainingInWords(null)).toBe('no end date');
    expect(remainingInWords(0)).toBe('runs out today');
    expect(remainingInWords(1)).toBe('1 day left');
    expect(remainingInWords(-1)).toBe('ran out 1 day ago');
    expect(remainingInWords(-12)).toBe('ran out 12 days ago');
  });

  it('reads a bounded span, and nothing at all for an open one', () => {
    expect(spanInWords({ rangeLow: 0, rangeHigh: 25 })).toBe('0 to 25');
    expect(spanInWords({ rangeLow: null, rangeHigh: null })).toBeNull();
    expect(spanInWords({ rangeLow: 0, rangeHigh: null })).toBeNull();
  });

  it('counts days to a date, and nothing when there is no date', () => {
    expect(daysUntil('2025-12-01', '2025-11-20')).toBe(11);
    expect(daysUntil('2025-11-01', '2025-11-20')).toBe(-19);
    expect(daysUntil(null, '2025-11-20')).toBeNull();
    expect(daysUntil('not a date', '2025-11-20')).toBeNull();
  });
});

describe('how a cell reads', () => {
  const cell = MATRIX.cells[0];

  it('is unknown when nothing is held', () => {
    expect(cellTone({ ...cell, level: null }, 400)).toBe('unknown');
  });

  it('lets an expiry beat the level', () => {
    expect(cellTone({ ...cell, level: 'APPROVER' }, 10)).toBe('warn');
    expect(cellTone({ ...cell, level: 'APPROVER' }, -1)).toBe('bad');
  });

  it('is quiet for a trainee and ok for anybody else with time left', () => {
    expect(cellTone({ ...cell, level: 'TRAINEE' }, 400)).toBe('quiet');
    expect(cellTone({ ...cell, level: 'AUTHORISED' }, 400)).toBe('ok');
    expect(cellTone({ ...cell, level: 'APPROVER' }, null)).toBe('ok');
  });
});

describe('reading the matrix', () => {
  it('lays a person out in the column order, with gaps', () => {
    const row = rowFor(MATRIX, 'a.pereira');

    expect(row.map((cell) => cell?.level ?? null)).toEqual(['APPROVER', 'TRAINEE', null]);
  });

  it('counts how deep a discipline is', () => {
    expect(depthOf(MATRIX, 'DIMENSIONAL')).toBe(2);
    expect(depthOf(MATRIX, 'MASS')).toBe(0);
  });

  it('names a discipline that is worked in with nobody able to approve', () => {
    expect(withoutAnApprover(MATRIX)).toEqual(['TORQUE']);
  });

  it('does not name a discipline nobody works in at all', () => {
    expect(withoutAnApprover(MATRIX)).not.toContain('MASS');
  });
});

describe('CompetenceMatrixComponent', () => {
  let fixture: ComponentFixture<CompetenceMatrixComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompetenceMatrixComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompetenceMatrixComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(matrix: CompetenceMatrix = MATRIX, expiring: CompetenceView[] = []): void {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/competence/matrix')).flush(matrix);
    http.expectOne((call) => call.url.endsWith('/competence/expiring')).flush(expiring);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('draws a row per person and a column per discipline', () => {
    render();

    expect(fixture.nativeElement.querySelectorAll('.grid tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.grid tbody tr:first-child td')).toHaveLength(3);
  });

  it('marks each cell with the level and leaves the gaps blank', () => {
    render();

    const marks = Array.from(fixture.nativeElement.querySelectorAll('.grid tbody tr td')).map(
      (node) => (node as HTMLElement).textContent?.trim(),
    );
    expect(marks).toEqual(['S', 'T', '', 'A', '', '']);
  });

  it('puts the whole sentence on the cell title', () => {
    render();

    const first = fixture.nativeElement.querySelector('.grid tbody tr td');
    expect(first.getAttribute('title')).toContain('a.pereira: Approves for dimensional');
  });

  it('warns when a discipline has nobody who can approve', () => {
    render();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('torque');
  });

  it('opens what one person holds when their name is used', () => {
    render();

    fixture.nativeElement.querySelector('.grid__person').click();

    http
      .expectOne((call) => call.url.includes('/competence/people/a.pereira'))
      .flush([grant({ person: 'a.pereira', level: 'APPROVER' })]);
    fixture.detectChanges();

    expect(text()).toContain('What a.pereira holds');
    expect(text()).toContain('Approves');
  });

  it('closes the panel again when the same name is used twice', () => {
    render();

    const button = fixture.nativeElement.querySelector('.grid__person');
    button.click();
    http.expectOne((call) => call.url.includes('/competence/people/')).flush([]);
    fixture.detectChanges();

    button.click();
    fixture.detectChanges();

    expect(text()).not.toContain('What a.pereira holds');
  });

  it('strikes a withdrawn grant through and says why', () => {
    render();

    fixture.nativeElement.querySelector('.grid__person').click();
    http.expectOne((call) => call.url.includes('/competence/people/')).flush([
      grant({ withdrawn: true, withdrawnReason: 'failed the witness check', live: false }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.held__gone')).toHaveLength(1);
    expect(text()).toContain('failed the witness check');
  });

  it('asks again with a new horizon', () => {
    render();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.matrix__horizon select');
    select.value = '180';
    select.dispatchEvent(new Event('change'));

    const request = http.expectOne((call) => call.url.endsWith('/competence/expiring'));
    expect(request.request.params.get('withinDays')).toBe('180');
    request.flush([]);
  });

  it('lists the renewals that are coming up', () => {
    render(MATRIX, [grant({ daysRemaining: 12 })]);

    expect(text()).toContain('Coming up for renewal');
    expect(text()).toContain('12 days left');
  });

  it('says so plainly when nobody is authorised at all', () => {
    render({ people: [], disciplines: [], cells: [] });

    expect(text()).toContain('Nobody is authorised yet');
  });

  it('shows a failure where somebody will read it', () => {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/competence/matrix')).flush(
      {
        type: 'https://errors.slipgauge.internal/registry/internal',
        title: 'INTERNAL',
        status: 500,
        detail: 'the register is not answering',
        code: 'registry/internal',
      },
      { status: 500, statusText: 'Server Error' },
    );
    http.expectOne((call) => call.url.endsWith('/competence/expiring')).flush([]);
    fixture.detectChanges();

    expect(text()).toContain('the register is not answering');
  });
});
