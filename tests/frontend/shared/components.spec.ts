import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  MeasurementPointView,
  bandPosition,
  testUncertaintyRatio,
  verdictLabel,
  verdictTone,
  worstVerdict,
} from '@core/models/calibration.model';
import { InstrumentStatus, statusIsUsable, statusLabel } from '@core/models/instrument.model';
import { point } from '@fixtures';
import { toneForBandPosition, toneForDueIn, toneForTestRatio } from '@shared/tone';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { StatusBadgeComponent } from '@shared/components/status-badge.component';
import { VerdictBadgeComponent } from '@shared/components/verdict-badge.component';
import { PointTableComponent } from '@features/certificate/point-table.component';

describe('calibration labels', () => {
  it('has a readable label for every verdict', () => {
    expect(verdictLabel('OUT_OF_TOLERANCE')).toBe('Out of tolerance');
    expect(verdictLabel('INDETERMINATE')).toBe('Not statable');
    expect(verdictLabel('NOT_ASSESSED')).toBe('Not assessed');
  });

  it('colours a marginal result differently from a failure', () => {
    expect(verdictTone('PASS')).toBe('ok');
    expect(verdictTone('MARGINAL')).toBe('warn');
    expect(verdictTone('OUT_OF_TOLERANCE')).toBe('bad');
    expect(verdictTone('NOT_ASSESSED')).toBe('unknown');
  });

  it('takes the worst verdict across the points', () => {
    expect(
      worstVerdict([point(), point({ asFoundVerdict: 'MARGINAL' }), point()]),
    ).toBe('MARGINAL');
    expect(
      worstVerdict([point({ asFoundVerdict: 'INDETERMINATE' }), point({ asFoundVerdict: 'OUT_OF_TOLERANCE' })]),
    ).toBe('OUT_OF_TOLERANCE');
  });

  it('calls an empty certificate a pass rather than guessing', () => {
    expect(worstVerdict([])).toBe('PASS');
  });

  it('works out the ratio from the two stored numbers', () => {
    expect(testUncertaintyRatio(point())).toBeCloseTo(8, 6);
    expect(testUncertaintyRatio(point({ expandedUncertainty: 0 }))).toBeNull();
  });

  it('places the reading in its band, minus one to plus one', () => {
    expect(bandPosition(point({ asFound: 5 }))).toBeCloseTo(0, 9);
    expect(bandPosition(point({ asFound: 5.004 }))).toBeCloseTo(1, 9);
    expect(bandPosition(point({ asFound: 4.996 }))).toBeCloseTo(-1, 9);
    expect(bandPosition(point({ asFound: null }))).toBeNull();
  });

  it('reports a collapsed band as dead centre rather than dividing by nothing', () => {
    expect(bandPosition(point({ toleranceLow: 5, toleranceHigh: 5 }))).toBe(0);
  });
});

describe('instrument status labels', () => {
  it('has a label for every status', () => {
    const statuses: readonly InstrumentStatus[] = [
      'IN_SERVICE',
      'IN_CALIBRATION',
      'QUARANTINED',
      'UNDER_REPAIR',
      'ON_LOAN',
      'RETIRED',
    ];

    for (const status of statuses) {
      expect(statusLabel(status)).not.toBe('');
    }
  });

  it('only calls in service and on loan usable', () => {
    expect(statusIsUsable('IN_SERVICE')).toBe(true);
    expect(statusIsUsable('ON_LOAN')).toBe(true);
    expect(statusIsUsable('QUARANTINED')).toBe(false);
    expect(statusIsUsable('RETIRED')).toBe(false);
  });
});

describe('StatusBadgeComponent', () => {
  async function render(status: InstrumentStatus): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [StatusBadgeComponent] }).compileComponents();
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.badge') as HTMLElement;
  }

  it('shows the readable label rather than the enum', async () => {
    expect((await render('IN_CALIBRATION')).textContent?.trim()).toBe('At calibration');
  });

  it('carries a tone the stylesheet can colour by', async () => {
    expect((await render('IN_SERVICE')).dataset['tone']).toBe('ok');
    expect((await render('QUARANTINED')).dataset['tone']).toBe('bad');
    expect((await render('RETIRED')).dataset['tone']).toBe('quiet');
  });
});

describe('VerdictBadgeComponent', () => {
  it('shows the label and the tone together', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [VerdictBadgeComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VerdictBadgeComponent);
    fixture.componentRef.setInput('verdict', 'MARGINAL');
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.verdict') as HTMLElement;
    expect(badge.textContent?.trim()).toBe('Marginal');
    expect(badge.dataset['tone']).toBe('warn');
  });
});

describe('EmptyStateComponent', () => {
  let fixture: ComponentFixture<EmptyStateComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [EmptyStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('headline', 'Nothing matches');
    fixture.detectChanges();
  });

  it('shows the headline on its own when that is all it was given', () => {
    expect(fixture.nativeElement.textContent).toContain('Nothing matches');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('offers an action once one is supplied', () => {
    let ran = 0;
    fixture.componentInstance.action.subscribe(() => (ran += 1));
    fixture.componentRef.setInput('actionLabel', 'Clear the filters');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(ran).toBe(1);
  });
});

describe('PointTableComponent', () => {
  async function render(points: MeasurementPointView[]): Promise<ComponentFixture<PointTableComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [PointTableComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PointTableComponent);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('unit', 'mm');
    fixture.detectChanges();
    return fixture;
  }

  it('draws a row per point in sequence order', async () => {
    const fixture = await render([point({ id: 2, sequenceNo: 2 }), point({ id: 1, sequenceNo: 1 })]);

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('1');
  });

  it('says so when everything was comfortable', async () => {
    const fixture = await render([point()]);

    expect(fixture.nativeElement.textContent).toContain('healthy uncertainty ratio');
  });

  it('calls out a guard band when the ratio is poor', async () => {
    const fixture = await render([point({ expandedUncertainty: 0.002 })]);

    expect(fixture.nativeElement.textContent).toContain('a guard band was applied');
  });

  it('calls out a reading that fell outside the band', async () => {
    const fixture = await render([
      point({ asFound: 5.0061, asFoundVerdict: 'OUT_OF_TOLERANCE' }),
    ]);

    expect(fixture.nativeElement.textContent).toContain('outside the permitted band');
    expect(fixture.nativeElement.querySelector('.points__row--outside')).not.toBeNull();
  });

  it('leaves the marker off a point with no reading', async () => {
    const fixture = await render([point({ asFound: null, normalisedAsFoundError: null })]);

    expect(fixture.nativeElement.querySelector('.band__marker')).toBeNull();
  });
});

describe('the shared tone vocabulary', () => {
  it('colours a reading by how much of its band it used', () => {
    expect(toneForBandPosition(0.2)).toBe('ok');
    expect(toneForBandPosition(-0.2)).toBe('ok');
    expect(toneForBandPosition(0.85)).toBe('warn');
    expect(toneForBandPosition(1.4)).toBe('bad');
    expect(toneForBandPosition(-1.4)).toBe('bad');
  });

  it('colours a ratio by whether conformity can be stated at all', () => {
    expect(toneForTestRatio(8)).toBe('ok');
    expect(toneForTestRatio(4)).toBe('ok');
    expect(toneForTestRatio(2)).toBe('warn');
    expect(toneForTestRatio(0.5)).toBe('bad');
  });

  it('treats an absent or unbounded ratio as nothing to worry about', () => {
    expect(toneForTestRatio(null)).toBe('ok');
    expect(toneForTestRatio(Number.POSITIVE_INFINITY)).toBe('ok');
  });

  it('colours a due date by how late it is', () => {
    expect(toneForDueIn(-1)).toBe('bad');
    expect(toneForDueIn(0)).toBe('warn');
    expect(toneForDueIn(7)).toBe('warn');
    expect(toneForDueIn(8)).toBe('ok');
  });

  it('has no colour for an instrument with no due date at all', () => {
    expect(toneForDueIn(Number.MAX_SAFE_INTEGER)).toBe('unknown');
  });
});
