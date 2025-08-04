import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { NotificationService } from '@core/notifications/notification.service';
import { SheetEntryComponent } from '@features/certificate/entry/sheet-entry.component';
import { SheetDraft, SheetStep } from '@features/certificate/entry/sheet.model';

/** Reaches the component's protected surface the way its own template does. */
interface Wizard {
  draft: () => SheetDraft;
  step: () => SheetStep;
  complete: () => boolean;
  problems: () => readonly { step: SheetStep }[];
  problemCount: (step: SheetStep) => number;
  patch: (change: Partial<SheetDraft>) => void;
  go: (step: SheetStep) => void;
  next: () => void;
  back: () => void;
  addPoint: () => void;
  removePoint: (key: string) => void;
  updatePoint: (key: string, change: Record<string, unknown>) => void;
  addStandard: (source: 'internal' | 'external') => void;
  removeStandard: (key: string) => void;
  updateStandard: (key: string, change: Record<string, unknown>) => void;
  copyFoundToLeft: () => void;
  file: () => void;
  startAgain: () => void;
}

describe('SheetEntryComponent', () => {
  let fixture: ComponentFixture<SheetEntryComponent>;
  let wizard: Wizard;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SheetEntryComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SheetEntryComponent);
    wizard = fixture.componentInstance as unknown as Wizard;
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();
  });

  afterEach(() => {
    notifications.dismissAll();
    http.verify();
  });

  function fillUsable(): void {
    wizard.patch({
      certificateNumber: 'SGM-2025-0412',
      assetTag: 'SG-000101',
      performedBy: 'R Okonjo',
      performedOn: '2025-04-12',
      issuedOn: '2025-04-14',
    });
    const point = wizard.draft().points[0];
    wizard.updatePoint(point.key, { nominal: 5, asFound: 5.0012, expandedUncertainty: 0.0005 });
    const standard = wizard.draft().standards[0];
    wizard.updateStandard(standard.key, { assetTag: 'SG-000901' });
  }

  it('starts on the header step with one point and one standard', () => {
    expect(wizard.step()).toBe('header');
    expect(wizard.draft().points).toHaveLength(1);
    expect(wizard.draft().standards).toHaveLength(1);
  });

  it('lets a technician move between steps even while things are missing', () => {
    wizard.next();
    expect(wizard.step()).toBe('standards');
    wizard.go('review');
    expect(wizard.step()).toBe('review');
    wizard.back();
    expect(wizard.step()).toBe('points');
  });

  it('will not step past the last one or before the first', () => {
    wizard.back();
    expect(wizard.step()).toBe('header');
    wizard.go('review');
    wizard.next();
    expect(wizard.step()).toBe('review');
  });

  it('counts the outstanding problems per step for the tab badges', () => {
    expect(wizard.problemCount('header')).toBeGreaterThan(0);
    fillUsable();
    expect(wizard.problemCount('header')).toBe(0);
    expect(wizard.complete()).toBe(true);
  });

  it('numbers a new point after the highest already there', () => {
    wizard.addPoint();
    wizard.addPoint();

    expect(wizard.draft().points.map((point) => point.sequenceNo)).toEqual([1, 2, 3]);
  });

  it('refuses to remove the last remaining point', () => {
    wizard.removePoint(wizard.draft().points[0].key);

    expect(wizard.draft().points).toHaveLength(1);
  });

  it('removes a point once there is more than one', () => {
    wizard.addPoint();
    const doomed = wizard.draft().points[0].key;

    wizard.removePoint(doomed);

    expect(wizard.draft().points).toHaveLength(1);
    expect(wizard.draft().points[0].key).not.toBe(doomed);
  });

  it('copies the as found column into as left in one go', () => {
    wizard.addPoint();
    const [first, second] = wizard.draft().points;
    wizard.updatePoint(first.key, { asFound: 5.0012 });
    wizard.updatePoint(second.key, { asFound: 10.0004 });

    wizard.copyFoundToLeft();

    expect(wizard.draft().points.map((point) => point.asLeft)).toEqual([5.0012, 10.0004]);
  });

  it('adds and removes standards of either source', () => {
    wizard.addStandard('external');
    expect(wizard.draft().standards).toHaveLength(2);
    expect(wizard.draft().standards[1].source).toBe('external');

    wizard.removeStandard(wizard.draft().standards[0].key);
    expect(wizard.draft().standards).toHaveLength(1);
  });

  it('will not file while anything is outstanding', () => {
    wizard.file();

    http.expectNone((request) => request.url.endsWith('/certificates'));
  });

  it('files the sheet once it is complete', () => {
    fillUsable();
    wizard.file();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/certificates'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body.certificateNumber).toBe('SGM-2025-0412');
    expect(request.request.body.standards[0]).toEqual({
      assetTag: 'SG-000901',
      role: 'REFERENCE',
    });

    request.flush({
      id: 7,
      certificateNumber: 'SGM-2025-0412',
      instrumentId: 3,
      asFoundVerdict: 'PASS',
      points: [],
    });

    expect(notifications.notices()[0].headline).toContain('Filed SGM-2025-0412');
  });

  it('sends the operator back to the standards step when the chain does not hold', () => {
    fillUsable();
    wizard.go('review');
    wizard.file();

    http.expectOne((candidate) => candidate.url.endsWith('/certificates')).flush(
      {
        type: 't',
        title: 'RULE_VIOLATION',
        status: 422,
        detail: '1 problem on the chain',
        code: 'registry/traceability-broken',
        timestamp: 'now',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(wizard.step()).toBe('standards');
    expect(notifications.notices()[0].headline).toContain('traceability chain');
  });

  it('starting again wipes the draft back to a fresh sheet', () => {
    fillUsable();
    wizard.go('review');

    wizard.startAgain();

    expect(wizard.step()).toBe('header');
    expect(wizard.draft().certificateNumber).toBe('');
    expect(wizard.complete()).toBe(false);
  });
});
