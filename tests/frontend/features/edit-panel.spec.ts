import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { InstrumentDetail } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import { EditPanelComponent } from '@features/instrument/edit/edit-panel.component';
import { EditDraft } from '@features/instrument/edit/edit.model';
import { detail, problem, signedInAs, signedOut } from '@fixtures';

interface Panel {
  draft: () => EditDraft;
  changes: () => readonly string[];
  consequences: () => readonly string[];
  canSave: () => boolean;
  mayEdit: () => boolean;
  change: (patch: Partial<EditDraft>) => void;
  revert: () => void;
  save: () => void;
  messageFor: (field: string) => string | null;
}

describe('EditPanelComponent', () => {
  let fixture: ComponentFixture<EditPanelComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  async function render(role = 'METROLOGIST'): Promise<Panel> {
    TestBed.resetTestingModule();
    signedInAs(role);
    await TestBed.configureTestingModule({
      imports: [EditPanelComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditPanelComponent);
    fixture.componentRef.setInput('instrument', detail('SG-000101', { id: 101 }));
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();

    http.match((request) => request.url.includes('/reference/')).forEach((r) => r.flush([]));
    return fixture.componentInstance as unknown as Panel;
  }

  afterEach(() => {
    notifications.dismissAll();
    signedOut();
    http.verify();
  });

  it('starts from the record it was given', async () => {
    const panel = await render();

    expect(panel.draft().rangeHigh).toBe(25);
    expect(panel.changes()).toEqual([]);
    expect(panel.canSave()).toBe(false);
  });

  it('will not save while nothing has changed', async () => {
    const panel = await render();
    panel.save();

    http.expectNone((request) => request.method === 'PUT');
  });

  it('enables the save as soon as something moves', async () => {
    const panel = await render();
    panel.change({ custodian: 'D Ferreira' });

    expect(panel.changes()).toEqual(['custodian']);
    expect(panel.canSave()).toBe(true);
  });

  it('refuses to save something the service would reject anyway', async () => {
    const panel = await render();
    panel.change({ rangeLow: 30 });

    expect(panel.canSave()).toBe(false);
    expect(panel.messageFor('span')).toContain('below the high end');
  });

  it('warns before a change that reaches past this record', async () => {
    const panel = await render();
    panel.change({ referenceStandard: true });

    expect(panel.consequences()[0]).toContain('cascade');
  });

  it('sends the whole editable half and reports what moved', async () => {
    const panel = await render();
    panel.change({ custodian: 'D Ferreira', description: 'moved to the thermal room' });
    panel.save();

    const request = http.expectOne(
      (candidate) => candidate.method === 'PUT' && candidate.url.endsWith('/instruments/101'),
    );
    expect(request.request.body.custodian).toBe('D Ferreira');
    expect(request.request.body.rangeHigh).toBe(25);
    request.flush(detail('SG-000101', { id: 101, custodian: 'D Ferreira' }));

    expect(notifications.notices()[0].headline).toBe('SG-000101 updated');
    expect(notifications.notices()[0].detail).toContain('custodian');
  });

  it('tells the page about the record that came back', async () => {
    const panel = await render();
    let emitted: InstrumentDetail | null = null;
    fixture.componentInstance.saved.subscribe((updated) => (emitted = updated));

    panel.change({ custodian: 'D Ferreira' });
    panel.save();
    http
      .expectOne((candidate) => candidate.method === 'PUT')
      .flush(detail('SG-000101', { id: 101, custodian: 'D Ferreira' }));

    expect(emitted).not.toBeNull();
  });

  it('offers a way back when the record moved under somebody', async () => {
    const panel = await render();
    panel.change({ custodian: 'D Ferreira' });
    panel.save();

    http
      .expectOne((candidate) => candidate.method === 'PUT')
      .flush(problem('registry/stale-record', 409, 'the record changed'), {
        status: 409,
        statusText: 'Conflict',
      });

    const notice = notifications.notices()[0];
    expect(notice.tone).toBe('warning');
    expect(notice.action?.label).toBe('Reload');
    notice.action?.run();
    expect(panel.changes()).toEqual([]);
  });

  it('putting it back clears every change', async () => {
    const panel = await render();
    panel.change({ custodian: 'D Ferreira', resolution: 0.01 });

    panel.revert();

    expect(panel.changes()).toEqual([]);
    expect(panel.canSave()).toBe(false);
  });

  it('a role that may not edit cannot save whatever it types', async () => {
    const panel = await render('AUDITOR');
    panel.change({ custodian: 'D Ferreira' });

    expect(panel.mayEdit()).toBe(false);
    expect(panel.canSave()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('read this record but not change it');
  });
});
