import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { InstrumentStatus, InstrumentSummary } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import { BulkBarComponent } from '@features/register/bulk/bulk-bar.component';
import { BulkPlan } from '@features/register/bulk/bulk.model';
import { detail, problem, summary } from '@fixtures';

interface Bar {
  action: () => string | null;
  targetStatus: { (): string; set: (value: string) => void };
  custodian: { (): string; set: (value: string) => void };
  plan: () => BulkPlan | null;
  ready: () => boolean;
  reachable: () => readonly InstrumentStatus[];
  outcome: () => { succeeded: number; failed: readonly unknown[] } | null;
  failureGroups: () => readonly { message: string; assetTags: readonly string[] }[];
  choose: (action: string) => void;
  apply: () => void;
  summary: () => string;
}

describe('BulkBarComponent', () => {
  let fixture: ComponentFixture<BulkBarComponent>;
  let bar: Bar;
  let http: HttpTestingController;
  let notifications: NotificationService;

  async function render(selection: InstrumentSummary[]): Promise<Bar> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [BulkBarComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BulkBarComponent);
    fixture.componentRef.setInput('selection', selection);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Bar;
  }

  afterEach(() => {
    notifications.dismissAll();
    http.verify();
  });

  it('offers no action until one is chosen', async () => {
    bar = await render([summary('SG-000101')]);

    expect(bar.action()).toBeNull();
    expect(bar.plan()).toBeNull();
  });

  it('offers only the statuses the selection can actually reach', async () => {
    bar = await render([
      summary('SG-000101', { status: 'QUARANTINED' }),
      summary('SG-000102', { status: 'RETIRED' }),
    ]);

    expect(bar.reachable()).toEqual(['IN_CALIBRATION', 'RETIRED', 'UNDER_REPAIR']);
  });

  it('plans nothing until a target is picked', async () => {
    bar = await render([summary('SG-000101')]);
    bar.choose('STATUS');

    expect(bar.plan()).toBeNull();
    expect(bar.ready()).toBe(false);
  });

  it('splits the selection once a target is picked', async () => {
    bar = await render([
      summary('SG-000101'),
      summary('SG-000102', { status: 'QUARANTINED' }),
    ]);
    bar.choose('STATUS');
    bar.targetStatus.set('QUARANTINED');

    expect(bar.plan()?.eligible.map((row) => row.assetTag)).toEqual(['SG-000101']);
    expect(bar.plan()?.blocked[0].reason).toBe('already quarantined');
    expect(bar.ready()).toBe(true);
  });

  it('choosing the same action twice puts it away', async () => {
    bar = await render([summary('SG-000101')]);
    bar.choose('STATUS');
    bar.choose('STATUS');

    expect(bar.action()).toBeNull();
  });

  it('sends one call per eligible instrument', async () => {
    bar = await render([summary('SG-000101'), summary('SG-000102')]);
    bar.choose('STATUS');
    bar.targetStatus.set('QUARANTINED');
    bar.apply();

    const calls = http.match((request) => request.url.includes('/status'));
    expect(calls).toHaveLength(2);
    calls.forEach((call, index) =>
      call.flush(detail(`SG-00010${index + 1}`, { status: 'QUARANTINED' })),
    );

    expect(bar.outcome()?.succeeded).toBe(2);
    expect(bar.summary()).toBe('2 updated');
  });

  it('reports a partial result rather than stopping at the first refusal', async () => {
    bar = await render([summary('SG-000101'), summary('SG-000102')]);
    bar.choose('STATUS');
    bar.targetStatus.set('QUARANTINED');
    bar.apply();

    const calls = http.match((request) => request.url.includes('/status'));
    calls[0].flush(detail('SG-000101', { status: 'QUARANTINED' }));
    calls[1].flush(problem('registry/forbidden', 403, 'your role does not allow that'), {
      status: 403,
      statusText: 'Forbidden',
    });

    expect(bar.outcome()?.succeeded).toBe(1);
    expect(bar.summary()).toBe('1 updated, 1 refused');
  });

  it('groups the refusals, because a batch fails the same way', async () => {
    bar = await render([summary('SG-000101'), summary('SG-000102')]);
    bar.choose('STATUS');
    bar.targetStatus.set('QUARANTINED');
    bar.apply();

    http.match((request) => request.url.includes('/status')).forEach((call) =>
      call.flush(problem('registry/forbidden', 403, 'your role does not allow that'), {
        status: 403,
        statusText: 'Forbidden',
      }),
    );

    expect(bar.failureGroups()).toHaveLength(1);
    expect(bar.failureGroups()[0].assetTags).toHaveLength(2);
  });

  it('reads a record before replacing it on a custodian move', async () => {
    bar = await render([summary('SG-000101', { custodian: 'R Okonjo' })]);
    bar.choose('CUSTODIAN');
    bar.custodian.set('D Ferreira');
    bar.apply();

    const read = http.expectOne(
      (request) => request.method === 'GET' && request.url.endsWith('/instruments/101'),
    );
    read.flush(detail('SG-000101', { id: 101, description: 'keep me' }));

    const write = http.expectOne(
      (request) => request.method === 'PUT' && request.url.endsWith('/instruments/101'),
    );
    expect(write.request.body.custodian).toBe('D Ferreira');
    expect(write.request.body.description).toBe('keep me');
    write.flush(detail('SG-000101', { id: 101, custodian: 'D Ferreira' }));

    expect(bar.outcome()?.succeeded).toBe(1);
  });

  it('will not apply an empty plan', async () => {
    bar = await render([summary('SG-000101', { status: 'QUARANTINED' })]);
    bar.choose('STATUS');
    bar.targetStatus.set('QUARANTINED');
    bar.apply();

    http.expectNone((request) => request.url.includes('/status'));
  });
});
