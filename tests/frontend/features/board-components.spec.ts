import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { RecallEntry } from '@core/models/recall.model';
import { NotificationService } from '@core/notifications/notification.service';
import { CapacityBoardComponent } from '@features/capacity/capacity-board.component';
import { Week } from '@features/capacity/capacity.model';
import { DashboardComponent } from '@features/dashboard/dashboard.component';
import { problem, recallEntry, signedInAs, signedOut } from '@fixtures';

const BOARD: RecallEntry[] = [
  recallEntry('SG-000101', -12, 'OVERDUE'),
  recallEntry('SG-000102', 3, 'DUE_THIS_WEEK', { criticality: 'CRITICAL' }),
  // Three in the same week, which is the lump the board exists to spot.
  recallEntry('SG-000103', 21, 'DUE_THIS_MONTH', { criticality: 'IMPORTANT' }),
  recallEntry('SG-000104', 22, 'DUE_THIS_MONTH', { criticality: 'IMPORTANT' }),
  recallEntry('SG-000105', 23, 'DUE_THIS_MONTH', { criticality: 'IMPORTANT' }),
];

const SUMMARY = { horizonDays: 120, overdue: 1, unscheduled: 2, byStanding: { OVERDUE: 1 } };

describe('CapacityBoardComponent', () => {
  let fixture: ComponentFixture<CapacityBoardComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  interface Board {
    plan: () => { weeks: readonly Week[]; overloadedWeeks: number; totalHours: number };
    suggestions: () => readonly { fromWeek: number; toWeek: number }[];
    suggestedHours: () => number;
    headroom: () => number;
    peak: () => number;
    capacityHours: () => number;
    openWeek: () => number | null;
    showSuggestions: { set: (value: boolean) => void };
    setCapacity: (hours: number) => void;
    toggleWeek: (index: number) => void;
    fill: (week: Week) => number;
    over: (week: Week) => boolean;
    spill: (week: Week) => number;
    suggestionsFor: (index: number) => readonly unknown[];
  }

  async function render(entries: RecallEntry[] = BOARD): Promise<Board> {
    TestBed.resetTestingModule();
    signedInAs('METROLOGIST');
    await TestBed.configureTestingModule({
      imports: [CapacityBoardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CapacityBoardComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();

    http.expectOne((request) => request.url.endsWith('/recalls')).flush(entries);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Board;
  }

  afterEach(() => {
    notifications.dismissAll();
    signedOut();
    http.verify();
  });

  it('lays twelve weeks out whatever is in them', async () => {
    const board = await render([]);

    expect(board.plan().weeks).toHaveLength(12);
    expect(board.plan().totalHours).toBe(0);
  });

  it('puts overdue work in the first week', async () => {
    const board = await render();

    expect(board.plan().weeks[0].overdue).toBe(1);
    expect(board.plan().weeks[0].entries).toHaveLength(2);
  });

  it('recomputes when the bench hours change, without asking again', async () => {
    const board = await render();
    const before = board.plan().overloadedWeeks;

    board.setCapacity(1);

    expect(board.plan().overloadedWeeks).toBeGreaterThan(before);
    http.expectNone((request) => request.url.endsWith('/recalls'));
  });

  it('clamps a silly number of bench hours', async () => {
    const board = await render();

    board.setCapacity(0);
    expect(board.capacityHours()).toBe(1);

    board.setCapacity(9999);
    expect(board.capacityHours()).toBe(200);
  });

  it('never fills a bar past the end', async () => {
    const board = await render();
    board.setCapacity(1);

    expect(board.fill(board.plan().weeks[0])).toBe(1);
    expect(board.over(board.plan().weeks[0])).toBe(true);
    expect(board.spill(board.plan().weeks[0])).toBeGreaterThan(0);
  });

  it('reports no spill on a week that fits', async () => {
    const board = await render();
    board.setCapacity(100);

    expect(board.over(board.plan().weeks[0])).toBe(false);
    expect(board.spill(board.plan().weeks[0])).toBe(0);
  });

  it('opens one week at a time', async () => {
    const board = await render();

    board.toggleWeek(0);
    expect(board.openWeek()).toBe(0);

    board.toggleWeek(3);
    expect(board.openWeek()).toBe(3);

    board.toggleWeek(3);
    expect(board.openWeek()).toBeNull();
  });

  it('suggests moves once a week will not fit', async () => {
    const board = await render();
    board.setCapacity(2);

    expect(board.suggestions().length).toBeGreaterThan(0);
    expect(board.suggestedHours()).toBeGreaterThan(0);
    expect(board.suggestions().every((move) => move.toWeek < move.fromWeek)).toBe(true);
  });

  it('files each suggestion against the week it would leave', async () => {
    const board = await render();
    board.setCapacity(2);
    const busiest = board.suggestions()[0].fromWeek;

    expect(board.suggestionsFor(busiest).length).toBeGreaterThan(0);
    expect(board.suggestionsFor(11)).toEqual([]);
  });

  it('drops the suggestions when they are switched off', async () => {
    const board = await render();
    board.setCapacity(2);
    board.showSuggestions.set(false);

    expect(board.suggestions()).toEqual([]);
  });

  it('reports negative headroom when the whole horizon will not fit', async () => {
    const board = await render();
    board.setCapacity(1);

    expect(board.headroom()).toBeLessThan(board.peak());
  });
});

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  async function render(): Promise<DashboardComponent> {
    TestBed.resetTestingModule();
    signedInAs('METROLOGIST');
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => {
    notifications.dismissAll();
    signedOut();
    http.verify();
  });

  function land(entries = BOARD, assessments: unknown[] = []): void {
    http.expectOne((request) => request.url.endsWith('/recalls')).flush(entries);
    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush(SUMMARY);
    http.expectOne((request) => request.url.endsWith('/impact')).flush(assessments);
    fixture.detectChanges();
  }

  it('greets whoever is signed in', async () => {
    await render();
    land();

    expect(fixture.nativeElement.textContent).toContain('Helen Whitcombe');
  });

  it('shows the tiles once everything has landed', async () => {
    await render();
    land();

    expect(fixture.nativeElement.querySelectorAll('.tile')).toHaveLength(5);
    expect(fixture.nativeElement.textContent).toContain('never calibrated');
  });

  it('says nothing is wrong only when nothing is', async () => {
    await render();
    http.expectOne((request) => request.url.endsWith('/recalls')).flush([]);
    http
      .expectOne((request) => request.url.endsWith('/recalls/summary'))
      .flush({ ...SUMMARY, overdue: 0, unscheduled: 0 });
    http.expectOne((request) => request.url.endsWith('/impact')).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing overdue');
  });

  it('lists the longest overdue', async () => {
    await render();
    land();

    expect(fixture.nativeElement.textContent).toContain('Longest overdue');
    expect(fixture.nativeElement.textContent).toContain('12 days ago');
  });

  it('shows a failure rather than an empty screen', async () => {
    await render();
    http.expectOne((request) => request.url.endsWith('/recalls')).flush([]);
    http.expectOne((request) => request.url.endsWith('/recalls/summary')).flush(SUMMARY);
    http
      .expectOne((request) => request.url.endsWith('/impact'))
      .flush(problem('registry/internal', 500, 'the request could not be completed'), {
        status: 500,
        statusText: 'Server Error',
      });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.dash__error')).not.toBeNull();
  });
});
