import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Tone } from '@shared/tone';

export interface DonutSlice {
  readonly label: string;
  readonly value: number;
  readonly tone: Tone;
}

interface LaidOutSlice extends DonutSlice {
  readonly path: string;
  readonly share: number;
}

const SIZE = 180;
const RADIUS = 78;
const THICKNESS = 26;

/**
 * The verdict mix and the recall standing mix, as a ring. A ring rather than a
 * pie because the middle carries the total, which is the number people read
 * first and then look at the ring to explain.
 */
@Component({
  selector: 'sg-donut-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './donut-chart.component.html',
  styleUrl: './donut-chart.component.scss',
})
export class DonutChartComponent {
  readonly slices = input.required<readonly DonutSlice[]>();
  readonly caption = input('');
  readonly centreLabel = input('');

  protected readonly size = SIZE;

  protected readonly total = computed(() =>
    this.slices().reduce((sum, slice) => sum + slice.value, 0),
  );

  protected readonly hasData = computed(() => this.total() > 0);

  protected readonly laidOut = computed<readonly LaidOutSlice[]>(() => {
    const total = this.total();
    if (total === 0) {
      return [];
    }
    let angle = -Math.PI / 2;
    return this.slices()
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const share = slice.value / total;
        const sweep = share * Math.PI * 2;
        const path = ringSegment(angle, angle + sweep);
        angle += sweep;
        return { ...slice, path, share };
      });
  });

  protected percent(share: number): string {
    return `${Math.round(share * 100)}%`;
  }
}

/**
 * An annular segment as a path. Drawn manually because a stroked circle with a
 * dash offset cannot show a segment that wraps past the start, and the verdict
 * ring regularly has one slice at ninety odd percent.
 */
function ringSegment(from: number, to: number): string {
  const centre = SIZE / 2;
  const outer = RADIUS;
  const inner = RADIUS - THICKNESS;
  const large = to - from > Math.PI ? 1 : 0;

  const outerStart = point(centre, outer, from);
  const outerEnd = point(centre, outer, to);
  const innerEnd = point(centre, inner, to);
  const innerStart = point(centre, inner, from);

  return [
    `M${outerStart.x},${outerStart.y}`,
    `A${outer},${outer} 0 ${large} 1 ${outerEnd.x},${outerEnd.y}`,
    `L${innerEnd.x},${innerEnd.y}`,
    `A${inner},${inner} 0 ${large} 0 ${innerStart.x},${innerStart.y}`,
    'Z',
  ].join(' ');
}

function point(centre: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: Number((centre + radius * Math.cos(angle)).toFixed(2)),
    y: Number((centre + radius * Math.sin(angle)).toFixed(2)),
  };
}
