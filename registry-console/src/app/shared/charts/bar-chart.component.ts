import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Tone } from '@shared/tone';
import { linearScale, niceTicks } from './scale';

export interface BarDatum {
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
}

interface LaidOutBar extends BarDatum {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const HEIGHT = 240;
const MARGIN = { top: 12, right: 12, bottom: 46, left: 44 };
const BAR_GAP = 8;

/**
 * A plain vertical bar chart. Used for the recall workload by week and for the
 * failure count by class, both of which are read at a glance from across a
 * room, so the bars are wide and the labels are not rotated.
 */
@Component({
  selector: 'sg-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.scss',
})
export class BarChartComponent {
  readonly data = input.required<readonly BarDatum[]>();
  readonly caption = input('');
  readonly width = input(640);
  readonly valueSuffix = input('');

  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;

  protected readonly plotWidth = computed(() => this.width() - MARGIN.left - MARGIN.right);
  protected readonly plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  protected readonly hasData = computed(() => this.data().length > 0);

  private readonly ceiling = computed(() => {
    const highest = this.data().reduce((max, datum) => Math.max(max, datum.value), 0);
    return highest === 0 ? 1 : highest;
  });

  protected readonly ticks = computed(() => {
    const y = linearScale([0, this.ceiling()], [MARGIN.top + this.plotHeight, MARGIN.top]);
    return niceTicks(0, this.ceiling(), 4).map((value) => ({ value, y: y(value) }));
  });

  protected readonly bars = computed<readonly LaidOutBar[]>(() => {
    const data = this.data();
    if (data.length === 0) {
      return [];
    }
    const y = linearScale([0, this.ceiling()], [MARGIN.top + this.plotHeight, MARGIN.top]);
    const slot = this.plotWidth() / data.length;
    const barWidth = Math.max(4, slot - BAR_GAP);

    return data.map((datum, index) => {
      const top = y(datum.value);
      return {
        ...datum,
        x: MARGIN.left + index * slot + (slot - barWidth) / 2,
        y: top,
        width: barWidth,
        height: Math.max(0, MARGIN.top + this.plotHeight - top),
      };
    });
  });

  protected readonly total = computed(() =>
    this.data().reduce((sum, datum) => sum + datum.value, 0),
  );

  /** Labels get thinned rather than rotated once they will not fit side by side. */
  protected readonly labelEvery = computed(() => {
    const slot = this.plotWidth() / Math.max(1, this.data().length);
    return slot < 42 ? Math.ceil(42 / slot) : 1;
  });

  protected showLabel(index: number): boolean {
    return index % this.labelEvery() === 0;
  }

  protected toneOf(datum: BarDatum): string {
    return datum.tone ?? 'neutral';
  }
}
