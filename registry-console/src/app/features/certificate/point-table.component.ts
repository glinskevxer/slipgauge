import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import {
  MeasurementPointView,
  bandPosition,
  testUncertaintyRatio,
} from '@core/models/calibration.model';
import { Tone, toneForTestRatio } from '@shared/tone';
import { VerdictBadgeComponent } from '@shared/components/verdict-badge.component';

interface PointRow {
  readonly point: MeasurementPointView;
  readonly ratio: number | null;
  readonly ratioTone: Tone;
  readonly position: number | null;
  readonly markerPercent: number;
  readonly outside: boolean;
}

/**
 * The measurement points on a certificate, with a small bar per row showing
 * where in the permitted band the as found reading landed.
 *
 * <p>The bar is the reason this is a component rather than a table in the
 * parent template. A technician reading a paper certificate can see at a glance
 * that a reading was near a limit; a column of decimals cannot do that, and
 * the near misses are exactly the ones worth noticing.
 */
@Component({
  selector: 'sg-point-table',
  standalone: true,
  imports: [DecimalPipe, VerdictBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './point-table.component.html',
  styleUrl: './point-table.component.scss',
})
export class PointTableComponent {
  readonly points = input.required<readonly MeasurementPointView[]>();
  readonly unit = input<string>('');

  protected readonly rows = computed<readonly PointRow[]>(() =>
    [...this.points()]
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((point) => {
        const ratio = testUncertaintyRatio(point);
        const position = bandPosition(point);
        return {
          point,
          ratio,
          ratioTone: toneForTestRatio(ratio),
          position,
          markerPercent: position === null ? 50 : clampPercent(50 + position * 50),
          outside: position !== null && Math.abs(position) > 1,
        };
      }),
  );

  protected readonly worstRatio = computed(() => {
    const ratios = this.rows()
      .map((row) => row.ratio)
      .filter((ratio): ratio is number => ratio !== null);
    return ratios.length === 0 ? null : Math.min(...ratios);
  });

  protected readonly anyOutside = computed(() => this.rows().some((row) => row.outside));

  protected formatRatio(ratio: number | null): string {
    if (ratio === null) {
      return 'not stated';
    }
    if (!Number.isFinite(ratio)) {
      return 'unbounded';
    }
    return `${ratio.toFixed(1)} to 1`;
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
