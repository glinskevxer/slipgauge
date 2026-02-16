import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import {
  AffectedWork,
  EnvironmentLimitView,
  ExcursionView,
  bandPosition,
  durationInWords,
  kindLabel,
  overshootInWords,
  severityLabel,
  severityTone,
  unitFor,
  worstFirst,
} from '@core/models/environment.model';
import { NotificationService } from '@core/notifications/notification.service';
import { RoomLogComponent } from '@features/environment/room-log.component';

function excursion(id: number, overrides: Partial<ExcursionView> = {}): ExcursionView {
  return {
    id,
    locationCode: 'HARLOW-DIM',
    locationName: 'Dimensional room',
    kind: 'TEMPERATURE_HIGH',
    severity: 'SIGNIFICANT',
    startedAt: '2025-11-20T09:00:00.000Z',
    endedAt: '2025-11-20T12:00:00.000Z',
    worstValue: 22.6,
    limitValue: 21,
    overshoot: 1.6,
    readings: 3,
    open: false,
    assessed: false,
    assessedBy: null,
    finding: null,
    putsWorkInQuestion: true,
    ...overrides,
  };
}

const LIMIT: EnvironmentLimitView = {
  id: 1,
  locationCode: 'HARLOW-DIM',
  locationName: 'Dimensional room',
  discipline: null,
  temperatureMin: 19,
  temperatureMax: 21,
  humidityMin: 40,
  humidityMax: 60,
  driftPerHour: null,
  soakHours: 12,
  methodReference: 'SLP-WI-002',
  summary: '19 to 21 C, 40 to 60 %RH',
};

const AFFECTED: AffectedWork = {
  excursionId: 1,
  locationCode: 'HARLOW-DIM',
  severity: 'SIGNIFICANT',
  from: '2025-11-20',
  to: '2025-11-20',
  certificates: [
    {
      certificateId: 11,
      certificateNumber: 'CAL-1',
      assetTag: 'SG-0001',
      performedOn: '2025-11-20',
      performedBy: 'r.okonjo',
      withdrawn: false,
      wholeDay: false,
    },
  ],
};

describe('excursion labels', () => {
  it('says what went wrong in words rather than in an enum', () => {
    expect(kindLabel('TEMPERATURE_HIGH')).toBe('Too warm');
    expect(kindLabel('DRIFT')).toBe('Moving too fast');
    expect(severityLabel('MAJOR')).toBe('Major');
  });

  it('reads each kind in its own unit', () => {
    expect(unitFor('TEMPERATURE_LOW')).toBe('C');
    expect(unitFor('HUMIDITY_HIGH')).toBe('%RH');
    expect(unitFor('DRIFT')).toBe('C/h');
  });

  it('colours a major one badly and a minor one quietly', () => {
    expect(severityTone('MAJOR')).toBe('bad');
    expect(severityTone('SIGNIFICANT')).toBe('warn');
    expect(severityTone('MINOR')).toBe('quiet');
  });

  it('reads the overshoot with the value and the limit beside it', () => {
    expect(overshootInWords(excursion(1))).toBe('22.6 C, 1.6 C past 21');
  });
});

describe('how long an excursion lasted', () => {
  it('reads hours to one place', () => {
    expect(durationInWords(excursion(1), '2025-11-21T00:00:00.000Z')).toBe('3 hours');
  });

  it('reads a single hour without the s', () => {
    expect(
      durationInWords(excursion(1, { endedAt: '2025-11-20T10:00:00.000Z' }), '2025-11-21T00:00:00.000Z'),
    ).toBe('1 hour');
  });

  it('drops to minutes under an hour', () => {
    expect(
      durationInWords(excursion(1, { endedAt: '2025-11-20T09:20:00.000Z' }), '2025-11-21T00:00:00.000Z'),
    ).toBe('20 minutes');
  });

  it('measures an open one against now', () => {
    expect(
      durationInWords(excursion(1, { endedAt: null, open: true }), '2025-11-20T11:00:00.000Z'),
    ).toBe('2 hours');
  });

  it('says so rather than showing a negative', () => {
    expect(durationInWords(excursion(1, { endedAt: null }), '2025-11-19T00:00:00.000Z')).toBe(
      'unknown',
    );
  });
});

describe('where a sample sits in the band', () => {
  it('is zero at the bottom and one at the top', () => {
    const sample = { takenAt: '', temperature: 19, humidity: null, outside: false };

    expect(bandPosition(sample, LIMIT)).toBe(0);
    expect(bandPosition({ ...sample, temperature: 21 }, LIMIT)).toBe(1);
    expect(bandPosition({ ...sample, temperature: 20 }, LIMIT)).toBe(0.5);
  });

  it('goes past the ends rather than clipping', () => {
    const sample = { takenAt: '', temperature: 22, humidity: null, outside: true };

    expect(bandPosition(sample, LIMIT)).toBe(1.5);
  });

  it('sits in the middle when there is no band at all', () => {
    const sample = { takenAt: '', temperature: 22, humidity: null, outside: false };

    expect(bandPosition(sample, null)).toBe(0.5);
    expect(bandPosition(sample, { ...LIMIT, temperatureMin: 21, temperatureMax: 21 })).toBe(0.5);
  });
});

describe('ordering the excursions', () => {
  it('puts the worst first, then the longest, then the newest', () => {
    const ordered = worstFirst([
      excursion(1, { severity: 'MINOR' }),
      excursion(2, { severity: 'MAJOR', readings: 2 }),
      excursion(3, { severity: 'MAJOR', readings: 9 }),
      excursion(4, { severity: 'SIGNIFICANT' }),
    ]);

    expect(ordered.map((row) => row.id)).toEqual([3, 2, 4, 1]);
  });
});

describe('RoomLogComponent', () => {
  let fixture: ComponentFixture<RoomLogComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomLogComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomLogComponent);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => http.verify());

  function render(rows: ExcursionView[], limits: EnvironmentLimitView[] = [LIMIT]): void {
    fixture.detectChanges();
    http.expectOne((call) => call.url.endsWith('/environment/excursions')).flush(rows);
    http.expectOne((call) => call.url.endsWith('/environment/limits')).flush(limits);
    fixture.detectChanges();
  }

  function openFirst(work: AffectedWork | null = AFFECTED): void {
    fixture.nativeElement.querySelector('.excursion__head').click();
    http.expectOne((call) => call.url.includes('/affected')).flush(work ?? AFFECTED);
    http.expectOne((call) => call.url.includes('/trace')).flush({
      locationCode: 'HARLOW-DIM',
      limit: LIMIT,
      samples: [],
    });
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('lists the excursions rather than the readings', () => {
    render([excursion(1), excursion(2, { severity: 'MAJOR' })]);

    expect(fixture.nativeElement.querySelectorAll('.excursion')).toHaveLength(2);
    expect(text()).toContain('Too warm in HARLOW-DIM');
    expect(text()).toContain('22.6 C, 1.6 C past 21');
  });

  it('shows the band each room is held to', () => {
    render([excursion(1)]);

    expect(text()).toContain('held to 19 to 21 C, 40 to 60 %RH');
    expect(text()).toContain('12 h soak');
  });

  it('counts the major ones and the ones still out', () => {
    render([
      excursion(1, { severity: 'MAJOR' }),
      excursion(2, { open: true, endedAt: null }),
      excursion(3, { severity: 'MINOR', putsWorkInQuestion: false }),
    ]);

    const counts = Array.from(fixture.nativeElement.querySelectorAll('.tile__count')).map(
      (node) => (node as HTMLElement).textContent?.trim(),
    );
    expect(counts).toEqual(['1', '1', '2']);
  });

  it('marks one that is still out', () => {
    render([excursion(1, { open: true, endedAt: null })]);

    expect(text()).toContain('still out');
  });

  it('opens an excursion and lists what it put in question', () => {
    render([excursion(1)]);
    openFirst();

    expect(text()).toContain('What went out while the room was like this');
    expect(text()).toContain('CAL-1');
    expect(text()).toContain('SG-0001');
  });

  it('says so plainly when it touched nothing', () => {
    render([excursion(1)]);
    openFirst({ ...AFFECTED, certificates: [] });

    expect(text()).toContain('Nothing was issued in that room while it lasted.');
  });

  it('closes again when the same one is used twice', () => {
    render([excursion(1)]);
    openFirst();

    fixture.nativeElement.querySelector('.excursion__head').click();
    fixture.detectChanges();

    expect(text()).not.toContain('What went out while the room was like this');
  });

  it('will not withdraw without a reason', () => {
    render([excursion(1)]);
    openFirst();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.danger');
    expect(button.disabled).toBe(true);
  });

  it('withdraws the affected work and says how much went', () => {
    render([excursion(1)]);
    openFirst();

    const reason: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="withdrawReason"]',
    );
    reason.value = 'chiller tripped overnight';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.danger').click();

    const posted = http.expectOne((call) => call.url.endsWith('/withdrawals'));
    expect(posted.request.body).toEqual({ reason: 'chiller tripped overnight' });
    posted.flush({ withdrawn: 1, alreadyWithdrawn: 0 });

    http.expectOne((call) => call.url.includes('/affected')).flush({
      ...AFFECTED,
      certificates: [{ ...AFFECTED.certificates[0], withdrawn: true }],
    });
    http.expectOne((call) => call.url.includes('/trace')).flush({
      locationCode: 'HARLOW-DIM',
      limit: LIMIT,
      samples: [],
    });
    fixture.detectChanges();

    expect(notifications.notices()[0].headline).toContain('1 certificate(s) withdrawn');
    expect(text()).toContain('withdrawn');
  });

  it('closes an excursion with a finding rather than a tick', () => {
    render([excursion(1)]);
    openFirst();

    const finding: HTMLInputElement = fixture.nativeElement.querySelector('input[name="finding"]');
    finding.value = 'chiller serviced, three certificates withdrawn';
    finding.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.primary').click();

    const posted = http.expectOne((call) => call.url.endsWith('/assessment'));
    expect(posted.request.body).toEqual({
      finding: 'chiller serviced, three certificates withdrawn',
    });
    posted.flush(excursion(1, { assessed: true }));

    http.expectOne((call) => call.url.endsWith('/environment/excursions')).flush([]);
    http.expectOne((call) => call.url.endsWith('/environment/limits')).flush([LIMIT]);
    fixture.detectChanges();

    expect(text()).toContain('The rooms have behaved');
  });

  it('offers no assessment on one that has not ended', () => {
    render([excursion(1, { open: true, endedAt: null })]);
    openFirst();

    expect(fixture.nativeElement.querySelector('input[name="finding"]')).toBeNull();
  });

  it('asks the service again when a room is typed in', () => {
    render([excursion(1)]);

    const input: HTMLInputElement = fixture.nativeElement.querySelector('.controls__field input');
    input.value = 'crewe-tool';
    input.dispatchEvent(new Event('change'));

    const request = http.expectOne((call) => call.url.endsWith('/environment/excursions'));
    expect(request.request.params.get('location')).toBe('CREWE-TOOL');
    request.flush([]);
    http.expectOne((call) => call.url.endsWith('/environment/limits')).flush([]);
  });

  it('drops the unassessed filter when it is switched off', () => {
    render([excursion(1)]);

    const check: HTMLInputElement = fixture.nativeElement.querySelector(
      '.controls__check input',
    );
    check.checked = false;
    check.dispatchEvent(new Event('change'));

    const request = http.expectOne((call) => call.url.endsWith('/environment/excursions'));
    expect(request.request.params.has('unassessed')).toBe(false);
    request.flush([]);
    http.expectOne((call) => call.url.endsWith('/environment/limits')).flush([]);
  });
});
