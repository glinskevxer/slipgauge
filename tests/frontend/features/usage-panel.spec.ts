import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { NotificationService } from '@core/notifications/notification.service';
import { OfflineQueueService } from '@core/offline/queue.service';
import { UsageView, byWorkOrder, isUntraceable, totalReadings, usageSpan } from '@core/models/usage.model';
import { usage } from '@fixtures';

const use = (id: number, usedOn: string, workOrder: string | null, readings = 1): UsageView =>
  usage(id, usedOn, workOrder, { readingCount: readings });
import { UsagePanelComponent } from '@features/usage/usage-panel.component';

describe('usage helpers', () => {
  it('calls a use with neither a work order nor a customer untraceable', () => {
    expect(isUntraceable(use(1, '2026-03-01', null))).toBe(true);
    expect(isUntraceable(use(2, '2026-03-01', 'WO-1'))).toBe(false);
  });

  it('treats a work order of only spaces as nothing', () => {
    expect(isUntraceable({ ...use(1, '2026-03-01', '   '), customer: null })).toBe(true);
  });

  it('groups by work order and puts the busiest first', () => {
    const grouped = byWorkOrder([
      use(1, '2026-03-01', 'WO-1', 2),
      use(2, '2026-03-02', 'WO-2', 9),
      use(3, '2026-03-03', 'WO-1', 3),
    ]);

    expect(grouped[0].workOrder).toBe('WO-2');
    expect(grouped[1].workOrder).toBe('WO-1');
    expect(grouped[1].readings).toBe(5);
  });

  it('collects the orphans under one heading', () => {
    const grouped = byWorkOrder([use(1, '2026-03-01', null), use(2, '2026-03-02', null)]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].workOrder).toBe('No work order');
  });

  it('adds up the readings rather than counting the entries', () => {
    expect(totalReadings([use(1, '2026-03-01', 'WO-1', 12), use(2, '2026-03-02', 'WO-1', 8)])).toBe(
      20,
    );
  });

  it('reports the span the uses cover', () => {
    expect(
      usageSpan([use(1, '2026-03-09', 'WO-1'), use(2, '2026-03-01', 'WO-1')]),
    ).toEqual(['2026-03-01', '2026-03-09']);
    expect(usageSpan([])).toBeNull();
  });
});

describe('UsagePanelComponent', () => {
  let fixture: ComponentFixture<UsagePanelComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;
  let queue: OfflineQueueService;

  interface Api {
    uses: () => readonly UsageView[];
    usedBy: { set: (value: string) => void };
    workOrder: { set: (value: string) => void };
    canSubmit: () => boolean;
    wouldBeUntraceable: () => boolean;
    readings: () => number;
    submit: () => void;
  }

  async function render(usable = true): Promise<Api> {
    await TestBed.configureTestingModule({
      imports: [UsagePanelComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsagePanelComponent);
    fixture.componentRef.setInput('instrumentId', 12);
    fixture.componentRef.setInput('assetTag', 'SG-000101');
    fixture.componentRef.setInput('usable', usable);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    queue = TestBed.inject(OfflineQueueService);
    fixture.detectChanges();

    http.expectOne((request) => request.url.includes('/usage/instruments/12')).flush({
      items: [use(1, '2026-03-01', 'WO-1', 4)],
      page: 0,
      size: 50,
      totalItems: 1,
      totalPages: 1,
      first: true,
      last: true,
    });

    return fixture.componentInstance as unknown as Api;
  }

  afterEach(() => {
    notifications.dismissAll();
    localStorage.clear();
    http.verify();
  });

  it('loads the log for the instrument it was given', async () => {
    const panel = await render();

    expect(panel.uses()).toHaveLength(1);
    expect(panel.readings()).toBe(4);
  });

  it('will not submit without somebody to attribute it to', async () => {
    const panel = await render();

    expect(panel.canSubmit()).toBe(false);
    panel.usedBy.set('D Ferreira');
    expect(panel.canSubmit()).toBe(true);
  });

  it('will not submit at all for an instrument that may not be used', async () => {
    const panel = await render(false);
    panel.usedBy.set('D Ferreira');

    expect(panel.canSubmit()).toBe(false);
  });

  it('warns while there is nothing to chase the use by', async () => {
    const panel = await render();
    panel.usedBy.set('D Ferreira');

    expect(panel.wouldBeUntraceable()).toBe(true);
    panel.workOrder.set('WO-9');
    expect(panel.wouldBeUntraceable()).toBe(false);
  });

  it('puts a recorded use at the top of the list', async () => {
    const panel = await render();
    panel.usedBy.set('D Ferreira');
    panel.workOrder.set('WO-9');
    panel.submit();

    http
      .expectOne((request) => request.url.endsWith('/usage') && request.method === 'POST')
      .flush(use(2, '2026-03-10', 'WO-9', 1));

    expect(panel.uses()[0].workOrder).toBe('WO-9');
    expect(notifications.notices()[0].headline).toBe('Use recorded');
  });

  it('holds the entry rather than losing it when the link is down', async () => {
    const panel = await render();
    panel.usedBy.set('D Ferreira');
    panel.workOrder.set('WO-9');
    panel.submit();

    http
      .expectOne((request) => request.url.endsWith('/usage') && request.method === 'POST')
      .error(new ProgressEvent('network error'), { status: 0, statusText: 'Unknown Error' });

    expect(queue.hasWork()).toBe(true);
    expect(queue.queue()[0].describedAs).toContain('WO-9');
  });

  it('does not hold an entry the service refused on its merits', async () => {
    const panel = await render();
    panel.usedBy.set('D Ferreira');
    panel.submit();

    http
      .expectOne((request) => request.url.endsWith('/usage') && request.method === 'POST')
      .flush(
        {
          code: 'registry/rule-violation',
          status: 422,
          detail: 'SG-000101 is QUARANTINED and must not be used to take a reading',
          title: 'x',
          type: 't',
          timestamp: 'now',
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

    expect(queue.hasWork()).toBe(false);
    expect(notifications.notices()[0].detail).toContain('QUARANTINED');
  });
});
