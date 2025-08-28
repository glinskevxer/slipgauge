import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { InstrumentClassView, StorageLocationView } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import { ClassAdminComponent } from '@features/admin/class-admin.component';
import { LocationAdminComponent } from '@features/admin/location-admin.component';
import { problem, signedInAs, signedOut } from '@fixtures';

function instrumentClass(
  code: string,
  overrides: Partial<InstrumentClassView> = {},
): InstrumentClassView {
  return {
    id: code.length,
    code,
    name: `${code} class`,
    discipline: 'DIMENSIONAL',
    criticality: 'IMPORTANT',
    baseIntervalDays: 365,
    minIntervalDays: 180,
    maxIntervalDays: 730,
    ...overrides,
  };
}

function location(
  code: string,
  parentCode: string | null,
  site = 'HARLOW',
): StorageLocationView {
  return { id: code.length, code, name: `${code} room`, site, parentCode, path: [code] };
}

describe('ClassAdminComponent', () => {
  let fixture: ComponentFixture<ClassAdminComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  interface Admin {
    classes: () => readonly InstrumentClassView[];
    shown: () => readonly InstrumentClassView[];
    filter: { set: (value: string) => void };
    editing: () => string | null;
    draft: () => { baseIntervalDays: number } | null;
    draftInvalid: () => boolean;
    edit: (entry: InstrumentClassView) => void;
    change: (patch: Record<string, unknown>) => void;
    cancel: () => void;
    save: () => void;
    windowOf: (entry: InstrumentClassView) => string;
    countsByDiscipline: () => Map<string, number>;
  }

  async function render(): Promise<Admin> {
    TestBed.resetTestingModule();
    signedInAs('ADMIN');
    await TestBed.configureTestingModule({
      imports: [ClassAdminComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClassAdminComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();

    http.expectOne((request) => request.url.endsWith('/reference/classes')).flush([
      instrumentClass('MIC-EXT'),
      instrumentClass('BAL-ANA', { discipline: 'MASS', criticality: 'CRITICAL' }),
      instrumentClass('CAL-VER', { maxIntervalDays: 548 }),
    ]);

    return fixture.componentInstance as unknown as Admin;
  }

  afterEach(() => {
    notifications.dismissAll();
    signedOut();
    http.verify();
  });

  it('lists what the lookup returned, in code order', async () => {
    const admin = await render();

    expect(admin.shown().map((entry) => entry.code)).toEqual([
      'BAL-ANA',
      'CAL-VER',
      'MIC-EXT',
    ]);
  });

  it('filters by discipline without asking again', async () => {
    const admin = await render();
    admin.filter.set('MASS');

    expect(admin.shown().map((entry) => entry.code)).toEqual(['BAL-ANA']);
    http.expectNone((request) => request.url.endsWith('/reference/classes'));
  });

  it('counts the classes in each discipline for the chips', async () => {
    const admin = await render();

    expect(admin.countsByDiscipline().get('DIMENSIONAL')).toBe(2);
    expect(admin.countsByDiscipline().get('MASS')).toBe(1);
  });

  it('describes how much room the engine has inside a class', async () => {
    const admin = await render();

    expect(admin.windowOf(instrumentClass('X'))).toBe('151% of base');
    expect(
      admin.windowOf(instrumentClass('X', { minIntervalDays: 365, maxIntervalDays: 365 })),
    ).toBe('fixed');
  });

  it('opens one row for editing at a time', async () => {
    const admin = await render();
    admin.edit(admin.shown()[0]);

    expect(admin.editing()).toBe('BAL-ANA');
    expect(admin.draft()?.baseIntervalDays).toBe(365);
  });

  it('refuses a window that does not order', async () => {
    const admin = await render();
    admin.edit(admin.shown()[0]);
    admin.change({ minIntervalDays: 900 });

    expect(admin.draftInvalid()).toBe(true);
    admin.save();
    http.expectNone((request) => request.method === 'PUT');
  });

  it('refuses a class with no name at all', async () => {
    const admin = await render();
    admin.edit(admin.shown()[0]);
    admin.change({ name: '  ' });

    expect(admin.draftInvalid()).toBe(true);
  });

  it('sends the change and replaces the row it came back for', async () => {
    const admin = await render();
    admin.edit(admin.shown()[0]);
    admin.change({ maxIntervalDays: 900 });
    admin.save();

    http
      .expectOne((request) => request.url.includes('/admin/classes/BAL-ANA'))
      .flush(instrumentClass('BAL-ANA', { discipline: 'MASS', maxIntervalDays: 900 }));

    expect(admin.classes().find((entry) => entry.code === 'BAL-ANA')?.maxIntervalDays).toBe(900);
    expect(admin.editing()).toBeNull();
    expect(notifications.notices()[0].headline).toBe('BAL-ANA updated');
  });

  it('leaves the row open when the service refuses', async () => {
    const admin = await render();
    admin.edit(admin.shown()[0]);
    admin.change({ maxIntervalDays: 900 });
    admin.save();

    http
      .expectOne((request) => request.url.includes('/admin/classes/BAL-ANA'))
      .flush(problem('registry/forbidden', 403, 'your role does not allow that'), {
        status: 403,
        statusText: 'Forbidden',
      });

    expect(admin.editing()).toBe('BAL-ANA');
  });

  it('cancelling leaves the row as it was', async () => {
    const admin = await render();
    admin.edit(admin.shown()[0]);
    admin.change({ maxIntervalDays: 900 });
    admin.cancel();

    expect(admin.editing()).toBeNull();
    expect(admin.classes().find((entry) => entry.code === 'BAL-ANA')?.maxIntervalDays).toBe(730);
  });
});

describe('LocationAdminComponent', () => {
  let fixture: ComponentFixture<LocationAdminComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  interface Admin {
    rows: () => readonly { location: StorageLocationView; depth: number }[];
    siteCount: () => number;
    canAdd: () => boolean;
    newCode: { set: (value: string) => void };
    newName: { set: (value: string) => void };
    newSite: { set: (value: string) => void };
    parentsFor: (code: string) => readonly string[];
    indent: (depth: number) => string;
    add: () => void;
    moveTo: (code: string, parentCode: string) => void;
  }

  async function render(): Promise<Admin> {
    TestBed.resetTestingModule();
    signedInAs('ADMIN');
    await TestBed.configureTestingModule({
      imports: [LocationAdminComponent],
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationAdminComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();

    http.expectOne((request) => request.url.endsWith('/reference/locations')).flush([
      location('HARLOW', null),
      location('HARLOW-LAB', 'HARLOW'),
      location('HARLOW-DIM', 'HARLOW-LAB'),
      location('CREWE', null, 'CREWE'),
    ]);

    return fixture.componentInstance as unknown as Admin;
  }

  afterEach(() => {
    notifications.dismissAll();
    signedOut();
    http.verify();
  });

  it('draws the tree in display order with a depth for each row', async () => {
    const admin = await render();

    expect(admin.rows().map((row) => row.location.code)).toEqual([
      'CREWE',
      'HARLOW',
      'HARLOW-LAB',
      'HARLOW-DIM',
    ]);
    expect(admin.rows()[3].depth).toBe(2);
    expect(admin.indent(2)).toBe('2.5rem');
  });

  it('counts the sites at the root', async () => {
    const admin = await render();

    expect(admin.siteCount()).toBe(2);
  });

  it('leaves a location out of its own list of possible parents', async () => {
    const admin = await render();

    expect(admin.parentsFor('HARLOW-LAB')).not.toContain('HARLOW-DIM');
    expect(admin.parentsFor('HARLOW-LAB')).toContain('CREWE');
  });

  it('will not add a code that is already taken', async () => {
    const admin = await render();
    admin.newCode.set('HARLOW');
    admin.newName.set('Duplicate');
    admin.newSite.set('HARLOW');

    expect(admin.canAdd()).toBe(false);
  });

  it('adds a location, upper casing the codes as it goes', async () => {
    const admin = await render();
    admin.newCode.set('harlow-flow');
    admin.newName.set('Flow rig');
    admin.newSite.set('harlow');
    admin.add();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/admin/locations'));
    expect(request.request.body.code).toBe('HARLOW-FLOW');
    expect(request.request.body.site).toBe('HARLOW');
    request.flush(location('HARLOW-FLOW', null));

    expect(admin.rows()).toHaveLength(5);
  });

  it('moves a location and says where it went', async () => {
    const admin = await render();
    admin.moveTo('HARLOW-DIM', 'CREWE');

    http
      .expectOne((request) => request.url.includes('/admin/locations/HARLOW-DIM/parent'))
      .flush(location('HARLOW-DIM', 'CREWE'));

    expect(notifications.notices()[0].detail).toContain('CREWE');
  });

  it('sends a null parent when a location is lifted to the root', async () => {
    const admin = await render();
    admin.moveTo('HARLOW-DIM', '');

    const request = http.expectOne((candidate) =>
      candidate.url.includes('/admin/locations/HARLOW-DIM/parent'),
    );
    expect(request.request.body.parentCode).toBeNull();
    request.flush(location('HARLOW-DIM', null));

    expect(notifications.notices()[0].detail).toContain('site of its own');
  });
});
