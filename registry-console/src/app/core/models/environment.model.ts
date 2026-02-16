import { Tone } from '@shared/tone';
import { Discipline } from './instrument.model';

export type ExcursionKind =
  | 'TEMPERATURE_HIGH'
  | 'TEMPERATURE_LOW'
  | 'HUMIDITY_HIGH'
  | 'HUMIDITY_LOW'
  | 'DRIFT';

export type ExcursionSeverity = 'MINOR' | 'SIGNIFICANT' | 'MAJOR';

export interface EnvironmentLimitView {
  readonly id: number;
  readonly locationCode: string;
  readonly locationName: string;
  readonly discipline: Discipline | null;
  readonly temperatureMin: number;
  readonly temperatureMax: number;
  readonly humidityMin: number | null;
  readonly humidityMax: number | null;
  readonly driftPerHour: number | null;
  readonly soakHours: number;
  readonly methodReference: string | null;
  readonly summary: string;
}

export interface ExcursionView {
  readonly id: number;
  readonly locationCode: string;
  readonly locationName: string;
  readonly kind: ExcursionKind;
  readonly severity: ExcursionSeverity;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly worstValue: number;
  readonly limitValue: number;
  readonly overshoot: number;
  readonly readings: number;
  readonly open: boolean;
  readonly assessed: boolean;
  readonly assessedBy: string | null;
  readonly finding: string | null;
  readonly putsWorkInQuestion: boolean;
}

export interface RoomSample {
  readonly takenAt: string;
  readonly temperature: number;
  readonly humidity: number | null;
  readonly outside: boolean;
}

export interface RoomTrace {
  readonly locationCode: string;
  readonly limit: EnvironmentLimitView | null;
  readonly samples: readonly RoomSample[];
}

export interface AffectedCertificate {
  readonly certificateId: number;
  readonly certificateNumber: string;
  readonly assetTag: string;
  readonly performedOn: string;
  readonly performedBy: string;
  readonly withdrawn: boolean;
  readonly wholeDay: boolean;
}

export interface AffectedWork {
  readonly excursionId: number;
  readonly locationCode: string;
  readonly severity: string;
  readonly from: string;
  readonly to: string;
  readonly certificates: readonly AffectedCertificate[];
}

const KIND_LABELS: Readonly<Record<ExcursionKind, string>> = {
  TEMPERATURE_HIGH: 'Too warm',
  TEMPERATURE_LOW: 'Too cold',
  HUMIDITY_HIGH: 'Too damp',
  HUMIDITY_LOW: 'Too dry',
  DRIFT: 'Moving too fast',
};

const SEVERITY_LABELS: Readonly<Record<ExcursionSeverity, string>> = {
  MINOR: 'Minor',
  SIGNIFICANT: 'Significant',
  MAJOR: 'Major',
};

/** The unit the value is read in, which is not the same for every kind. */
const KIND_UNITS: Readonly<Record<ExcursionKind, string>> = {
  TEMPERATURE_HIGH: 'C',
  TEMPERATURE_LOW: 'C',
  HUMIDITY_HIGH: '%RH',
  HUMIDITY_LOW: '%RH',
  DRIFT: 'C/h',
};

export function kindLabel(kind: ExcursionKind): string {
  return KIND_LABELS[kind] ?? kind;
}

export function severityLabel(severity: ExcursionSeverity): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

export function unitFor(kind: ExcursionKind): string {
  return KIND_UNITS[kind] ?? '';
}

export function severityTone(severity: ExcursionSeverity): Tone {
  switch (severity) {
    case 'MAJOR':
      return 'bad';
    case 'SIGNIFICANT':
      return 'warn';
    default:
      return 'quiet';
  }
}

/** How the reading reads: the value it hit and how far past the limit that was. */
export function overshootInWords(excursion: ExcursionView): string {
  const unit = unitFor(excursion.kind);

  return `${excursion.worstValue} ${unit}, ${excursion.overshoot} ${unit} past ${excursion.limitValue}`;
}

/** How long it lasted, in the words somebody would use out loud. */
export function durationInWords(excursion: ExcursionView, now: string): string {
  const to = excursion.endedAt ?? now;
  const hours = (Date.parse(to) - Date.parse(excursion.startedAt)) / 3_600_000;

  if (!Number.isFinite(hours) || hours < 0) {
    return 'unknown';
  }
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const whole = Math.round(hours * 10) / 10;
  return `${whole} hour${whole === 1 ? '' : 's'}`;
}

/**
 * Where a sample sits inside the band, as a fraction from zero at the bottom to
 * one at the top. Outside the band it goes past either end, which is what lets
 * the chart draw the overshoot rather than clipping it to the edge.
 */
export function bandPosition(sample: RoomSample, limit: EnvironmentLimitView | null): number {
  if (!limit) {
    return 0.5;
  }
  const width = limit.temperatureMax - limit.temperatureMin;

  if (width <= 0) {
    return 0.5;
  }
  return (sample.temperature - limit.temperatureMin) / width;
}

/** Excursions worth chasing first: worst, then longest, then newest. */
export function worstFirst(rows: readonly ExcursionView[]): readonly ExcursionView[] {
  const rank: Readonly<Record<ExcursionSeverity, number>> = {
    MAJOR: 2,
    SIGNIFICANT: 1,
    MINOR: 0,
  };

  return [...rows].sort(
    (a, b) =>
      rank[b.severity] - rank[a.severity] ||
      b.readings - a.readings ||
      b.startedAt.localeCompare(a.startedAt),
  );
}
