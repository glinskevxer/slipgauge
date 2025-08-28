import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { AuditLine, RefusalGroup } from '@core/models/audit.model';
import { NotificationService } from '@core/notifications/notification.service';
import { AuditViewerComponent } from '@features/audit/audit-viewer.component';
import { problem, signedInAs, signedOut } from '@fixtures';

function line(id: number, actor: string, action: string, occurredAt: string): AuditLine {
  return {
    id,
    occurredAt,
    actor,
    action,
    subject: 'account',
    subjectId: String(id),
    outcome: 'DENIED',
    detail: 'wrong password',
    correlation: `c-${id}`,
  };
}

const LINES = [
  line(1, 'r.okonjo', 'sign-in', '2026-06-29T09:00:00Z'),
  line(2, 'r.okonjo', 'sign-in', '2026-06-29T09:00:20Z'),
  line(3, 'r.okonjo', 'sign-in', '2026-06-29T09:00:41Z'),
  line(4, 'd.ferreira', 'sign-in', '2026-06-29T11:14:00Z'),
  line(5, 'r.okonjo', 'change-password', '2026-06-29T14:02:00Z'),
];

describe('AuditViewerComponent', () => {
  let fixture: ComponentFixture<AuditViewerComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  interface Viewer {
    days: () => number;
    groups: () => readonly RefusalGroup[];
    worrying: () => readonly RefusalGroup[];
    totalRefusals: () => number;
    distinctActors: () => number;
    actorFilter: { set: (value: string) => void };
    expanded: () => string | null;
    setWindow: (days: number) => void;
    toggle: (group: RefusalGroup) => void;
    isExpanded: (group: RefusalGroup) => boolean;
    isWorrying: (group: RefusalGroup) => boolean;
  }

  async function render(lines: AuditLine[] = LINES): Promise<Viewer> {
    TestBed.resetTestingModule();
    signedInAs('QUALITY_MANAGER');
    await TestBed.configureTestingModule({
      imports: [AuditViewerComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditViewerComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();

    http.expectOne((request) => request.url.endsWith('/audit/refusals')).flush(lines);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Viewer;
  }

  afterEach(() => {
    notifications.dismissAll();
    signedOut();
    http.verify();
  });

  it('opens on the last week', async () => {
    const viewer = await render();

    expect(viewer.days()).toBe(7);
  });

  it('groups by person and action', async () => {
    const viewer = await render();

    expect(viewer.groups()).toHaveLength(3);
    expect(viewer.groups()[0].count).toBe(3);
  });

  it('counts the refusals and the people behind them', async () => {
    const viewer = await render();

    expect(viewer.totalRefusals()).toBe(5);
    expect(viewer.distinctActors()).toBe(2);
  });

  it('flags a run of the same refusal as worth a look', async () => {
    const viewer = await render();

    expect(viewer.worrying()).toHaveLength(1);
    expect(viewer.isWorrying(viewer.groups()[0])).toBe(true);
    expect(viewer.isWorrying(viewer.groups()[1])).toBe(false);
  });

  it('filters by person without asking again', async () => {
    const viewer = await render();
    viewer.actorFilter.set('ferreira');

    expect(viewer.groups()).toHaveLength(1);
    expect(viewer.groups()[0].actor).toBe('d.ferreira');
    http.expectNone((request) => request.url.endsWith('/audit/refusals'));
  });

  it('matches a partial name whatever the case', async () => {
    const viewer = await render();
    viewer.actorFilter.set('OKONJO');

    expect(viewer.groups()).toHaveLength(2);
  });

  it('fetches again when the window changes', async () => {
    const viewer = await render();
    viewer.setWindow(30);

    const request = http.expectOne((candidate) => candidate.url.endsWith('/audit/refusals'));
    expect(request.request.params.get('days')).toBe('30');
    request.flush([]);

    expect(viewer.days()).toBe(30);
  });

  it('opens one group at a time', async () => {
    const viewer = await render();
    const [first, second] = viewer.groups();

    viewer.toggle(first);
    expect(viewer.isExpanded(first)).toBe(true);

    viewer.toggle(second);
    expect(viewer.isExpanded(first)).toBe(false);
    expect(viewer.isExpanded(second)).toBe(true);

    viewer.toggle(second);
    expect(viewer.expanded()).toBeNull();
  });

  it('says so when nothing was refused', async () => {
    await render([]);

    expect(fixture.nativeElement.textContent).toContain('Nothing was refused');
  });

  it('reports a failure rather than showing an empty log as clean', async () => {
    TestBed.resetTestingModule();
    signedInAs('QUALITY_MANAGER');
    await TestBed.configureTestingModule({
      imports: [AuditViewerComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditViewerComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();

    http
      .expectOne((request) => request.url.endsWith('/audit/refusals'))
      .flush(problem('registry/internal', 500, 'the request could not be completed'), {
        status: 500,
        statusText: 'Server Error',
      });

    expect(notifications.notices()[0].headline).toContain('Loading the refusal log');
  });
});
