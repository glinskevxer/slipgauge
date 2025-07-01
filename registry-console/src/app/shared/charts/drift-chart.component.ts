import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { CertificateView } from '@core/models/calibration.model';
import { Tone, toneForBandPosition } from '@shared/tone';
import { extent, linearScale, padDomain } from './scale';

interface DriftPoint {
  readonly x: number;
  readonly y: number;
  readonly certificateNumber: string;
  readonly performedOn: string;
  readonly normalised: number;
  readonly tone: Tone;
}

const WIDTH = 720;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 20, bottom: 32, left: 44 };

/**
 * Worst as found error per calibration, as a fraction of the permitted band.
 *
 * <p>Plotting the fraction rather than the raw error is what makes the chart
 * readable at all. An instrument's points can be millimetres and microvolts on
 * the same certificate, and the only question anyone asks of this chart is how
 * close to the limit the thing was getting.
 */
@Component({
  selector: 'sg-drift-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drift-chart.component.html',
  styleUrl: './drift-chart.component.scss',
})
export class DriftChartComponent {
  /** Certificates oldest first. */
  readonly history = input.required<readonly CertificateView[]>();
  readonly caption = input('Drift as a fraction of tolerance');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;

  protected readonly plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  protected readonly plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  private readonly series = computed(() =>
    this.history()
      .map((certificate) => ({
        certificate,
        normalised: worstNormalised(certificate),
      }))
      .filter(
        (entry): entry is { certificate: CertificateView; normalised: number } =>
          entry.normalised !== null,
      ),
  );

  protected readonly hasData = computed(() => this.series().length > 0);

  private readonly yDomain = computed<readonly [number, number]>(() => {
    const values = this.series().map((entry) => entry.normalised);
    const found = extent([...values, -1, 1]);
    return padDomain(found ?? [-1, 1], 0.12);
  });

  protected readonly points = computed<readonly DriftPoint[]>(() => {
    const series = this.series();
    if (series.length === 0) {
      return [];
    }
    const x = linearScale(
      [0, Math.max(1, series.length - 1)],
      [MARGIN.left, MARGIN.left + this.plotWidth],
    );
    const y = linearScale(this.yDomain(), [MARGIN.top + this.plotHeight, MARGIN.top]);

    return series.map((entry, index) => ({
      x: x(index),
      y: y(entry.normalised),
      certificateNumber: entry.certificate.certificateNumber,
      performedOn: entry.certificate.performedOn,
      normalised: entry.normalised,
      tone: toneForBandPosition(entry.normalised),
    }));
  });

  protected readonly path = computed(() =>
    this.points()
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)},${round(point.y)}`)
      .join(' '),
  );

  protected readonly limitLines = computed(() => {
    const y = linearScale(this.yDomain(), [MARGIN.top + this.plotHeight, MARGIN.top]);
    return [
      { value: 1, y: y(1), label: 'upper limit' },
      { value: 0, y: y(0), label: 'nominal' },
      { value: -1, y: y(-1), label: 'lower limit' },
    ];
  });

  protected readonly yTicks = computed(() => {
    const y = linearScale(this.yDomain(), [MARGIN.top + this.plotHeight, MARGIN.top]);
    return y.ticks(5).map((value) => ({ value, y: y(value) }));
  });

  protected readonly trend = computed<'rising' | 'falling' | 'flat' | null>(() => {
    const series = this.series();
    if (series.length < 3) {
      return null;
    }
    const first = Math.abs(series[0].normalised);
    const last = Math.abs(series[series.length - 1].normalised);
    const change = last - first;
    if (Math.abs(change) < 0.1) {
      return 'flat';
    }
    return change > 0 ? 'rising' : 'falling';
  });

  protected format(value: number): string {
    return value.toFixed(2);
  }
}

function worstNormalised(certificate: CertificateView): number | null {
  let worst: number | null = null;
  for (const point of certificate.points) {
    const value = point.normalisedAsFoundError;
    if (value === null) {
      continue;
    }
    if (worst === null || Math.abs(value) > Math.abs(worst)) {
      worst = value;
    }
  }
  return worst;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
