import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { InstrumentDetail, InstrumentStatus } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import { StatusActionsComponent } from '@features/instrument/status/status-actions.component';
import { StatusMove } from '@features/instrument/status/status-change.model';
import { detail, problem, signedInAs, signedOut } from '@fixtures';

interface Actions {
  moves: () => readonly StatusMove[];
  chosen: () => StatusMove | null;
  reason: { (): string; set: (value: string) => void };
  confirmation: () => string;
  canGo: () => boolean;
  choose: (move: StatusMove) => void;
  cancel: () => void;
  go: () => void;
}

describe('StatusActionsComponent', () => {
  let fixture: ComponentFixture<StatusActionsComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  async function render(status: InstrumentStatus = 'IN_SERVICE'): Promise<Actions> {
    TestBed.resetTestingModule();
    signedInAs('METROLOGIST');
    await TestBed.configureTestingModule({
      imports: [StatusActionsComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusActionsComponent);
    fixture.componentRef.setInput('instrument', detail('SG-000101', { id: 101, status }));
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Actions;
  }

  afterEach(() => {
    notifications.dismissAll();
    signedOut();
    http.verify();
  });

  it('offers nothing to a role that may not move an instrument', async () => {
    TestBed.resetTestingModule();
    signedInAs('AUDITOR');
    await TestBed.configureTestingModule({
      imports: [StatusActionsComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StatusActionsComponent);
    fixture.componentRef.setInput('instrument', detail('SG-000101', { id: 101 }));
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('can read this record but not move it');
  });

  it('offers the legal moves and nothing else', async () => {
    const actions = await render('QUARANTINED');

    expect(actions.moves().map((move) => move.target)).toEqual([
      'UNDER_REPAIR',
      'IN_CALIBRATION',
      'RETIRED',
    ]);
  });

  it('offers nothing at all once retired', async () => {
    const actions = await render('RETIRED');

    expect(actions.moves()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('nothing more can happen to it');
  });

  it('does nothing on the first click but describe the move', async () => {
    const actions = await render();
    const quarantine = actions.moves().find((move) => move.target === 'QUARANTINED')!;

    actions.choose(quarantine);

    expect(actions.confirmation()).toContain('SG-000101');
    expect(actions.confirmation()).toContain('from in service to quarantined');
    http.expectNone(() => true);
  });

  it('will not go until a reason is typed for the severe moves', async () => {
    const actions = await render();
    actions.choose(actions.moves().find((move) => move.target === 'QUARANTINED')!);

    expect(actions.canGo()).toBe(false);
    actions.reason.set('found reading high against the set');
    expect(actions.canGo()).toBe(true);
  });

  it('needs no reason for an ordinary move', async () => {
    const actions = await render();
    actions.choose(actions.moves().find((move) => move.target === 'ON_LOAN')!);

    expect(actions.canGo()).toBe(true);
  });

  it('choosing the same move twice puts the confirmation away', async () => {
    const actions = await render();
    const loan = actions.moves().find((move) => move.target === 'ON_LOAN')!;

    actions.choose(loan);
    actions.choose(loan);

    expect(actions.chosen()).toBeNull();
  });

  it('sends the status change and reports it', async () => {
    const actions = await render();
    actions.choose(actions.moves().find((move) => move.target === 'ON_LOAN')!);
    actions.go();

    const request = http.expectOne((candidate) => candidate.url.includes('/instruments/101/status'));
    expect(request.request.params.get('target')).toBe('ON_LOAN');
    request.flush(detail('SG-000101', { id: 101, status: 'ON_LOAN' }));

    expect(notifications.notices()[0].headline).toBe('SG-000101 is now on loan');
  });

  it('uses the retirement endpoint rather than the status one', async () => {
    const actions = await render();
    actions.choose(actions.moves().find((move) => move.target === 'RETIRED')!);
    actions.reason.set('dropped and the anvil is chipped');
    actions.go();

    http
      .expectOne((candidate) => candidate.url.includes('/instruments/101/retirement'))
      .flush(detail('SG-000101', { id: 101, status: 'RETIRED' }));

    expect(notifications.notices()[0].detail).toBe('dropped and the anvil is chipped');
  });

  it('tells the page about the record that came back', async () => {
    const actions = await render();
    let emitted: InstrumentDetail | null = null;
    fixture.componentInstance.moved.subscribe((updated) => (emitted = updated));

    actions.choose(actions.moves().find((move) => move.target === 'ON_LOAN')!);
    actions.go();
    http
      .expectOne((candidate) => candidate.url.includes('/status'))
      .flush(detail('SG-000101', { id: 101, status: 'ON_LOAN' }));

    expect(emitted).not.toBeNull();
  });

  it('leaves the confirmation open when the service refuses', async () => {
    const actions = await render();
    actions.choose(actions.moves().find((move) => move.target === 'ON_LOAN')!);
    actions.go();

    http
      .expectOne((candidate) => candidate.url.includes('/status'))
      .flush(problem('registry/forbidden', 403, 'your role does not allow that'), {
        status: 403,
        statusText: 'Forbidden',
      });

    expect(actions.chosen()).not.toBeNull();
    expect(notifications.notices()[0].tone).toBe('warning');
  });

  it('cancelling clears both the move and the reason', async () => {
    const actions = await render();
    actions.choose(actions.moves().find((move) => move.target === 'QUARANTINED')!);
    actions.reason.set('found reading high');

    actions.cancel();

    expect(actions.chosen()).toBeNull();
    expect(actions.reason()).toBe('');
  });
});
