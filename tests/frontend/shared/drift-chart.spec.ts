import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriftChartComponent } from '@shared/charts/drift-chart.component';
import { CertificateView, MeasurementPointView } from '@core/models/calibration.model';
import { certificate as buildCertificate, pointAt } from '@fixtures';

const point = (normalised: number | null, sequenceNo = 1): MeasurementPointView =>
  pointAt(normalised, sequenceNo);

const certificate = (number: string, points: MeasurementPointView[]): CertificateView =>
  buildCertificate(number, { points, performedOn: '2025-01-10', issuedOn: '2025-01-11' });

describe('DriftChartComponent', () => {
  let fixture: ComponentFixture<DriftChartComponent>;

  async function render(history: CertificateView[]): Promise<DriftChartComponent> {
    await TestBed.configureTestingModule({ imports: [DriftChartComponent] }).compileComponents();
    fixture = TestBed.createComponent(DriftChartComponent);
    fixture.componentRef.setInput('history', history);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function api(component: DriftChartComponent): {
    hasData: () => boolean;
    points: () => readonly { normalised: number; tone: string; x: number; y: number }[];
    path: () => string;
    trend: () => string | null;
  } {
    return component as unknown as ReturnType<typeof api>;
  }

  it('says it has nothing when every point is unread', async () => {
    const component = await render([certificate('SGM-001', [point(null)])]);

    expect(api(component).hasData()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No as found readings to plot yet');
  });

  it('plots one point per certificate', async () => {
    const component = await render([
      certificate('SGM-001', [point(0.1)]),
      certificate('SGM-002', [point(0.4)]),
      certificate('SGM-003', [point(0.8)]),
    ]);

    expect(api(component).points()).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('circle')).toHaveLength(3);
  });

  it('takes the worst point on a certificate, not the first', async () => {
    const component = await render([
      certificate('SGM-001', [point(0.2, 1), point(-0.9, 2), point(0.4, 3)]),
    ]);

    expect(api(component).points()[0].normalised).toBe(-0.9);
  });

  it('colours a point past the limit as a failure', async () => {
    const component = await render([
      certificate('SGM-001', [point(0.2)]),
      certificate('SGM-002', [point(0.85)]),
      certificate('SGM-003', [point(1.4)]),
    ]);

    expect(api(component).points().map((entry) => entry.tone)).toEqual(['ok', 'warn', 'bad']);
  });

  it('builds a move to then line to path in order', async () => {
    const component = await render([
      certificate('SGM-001', [point(0)]),
      certificate('SGM-002', [point(0.5)]),
    ]);

    const path = api(component).path();
    expect(path.startsWith('M')).toBe(true);
    expect(path.split('L')).toHaveLength(2);
  });

  it('reports no trend from fewer than three readings', async () => {
    const component = await render([
      certificate('SGM-001', [point(0.1)]),
      certificate('SGM-002', [point(0.9)]),
    ]);

    expect(api(component).trend()).toBeNull();
  });

  it('calls a growing magnitude a rising trend whichever side it drifts', async () => {
    const rising = await render([
      certificate('SGM-001', [point(-0.1)]),
      certificate('SGM-002', [point(-0.5)]),
      certificate('SGM-003', [point(-0.9)]),
    ]);

    expect(api(rising).trend()).toBe('rising');
  });

  it('calls a small change flat rather than inventing a direction', async () => {
    const flat = await render([
      certificate('SGM-001', [point(0.4)]),
      certificate('SGM-002', [point(0.45)]),
      certificate('SGM-003', [point(0.43)]),
    ]);

    expect(api(flat).trend()).toBe('flat');
  });

  it('always keeps both tolerance limits inside the drawn area', async () => {
    const component = await render([certificate('SGM-001', [point(0.05)])]);

    const limits = (component as unknown as { limitLines: () => { value: number }[] }).limitLines();
    expect(limits.map((limit) => limit.value)).toEqual([1, 0, -1]);
  });
});
