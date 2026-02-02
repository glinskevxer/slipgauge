/**
 * Turning a stream of room readings into the handful of events somebody has to
 * do something about.
 *
 * <p>The rule this file exists for is that an excursion is a run, not a
 * reading. One sample half a degree over on a Tuesday afternoon is a door
 * being held open; the same half degree for six hours is a failed air
 * conditioner and every certificate issued in that room while it lasted is in
 * question. A per reading alarm cannot tell those apart, and a laboratory that
 * gets one alarm per sample stops reading them by the end of the first week.
 */

/** What went out, and in which direction. */
export enum ExcursionKind {
  TEMPERATURE_HIGH = 'TEMPERATURE_HIGH',
  TEMPERATURE_LOW = 'TEMPERATURE_LOW',
  HUMIDITY_HIGH = 'HUMIDITY_HIGH',
  HUMIDITY_LOW = 'HUMIDITY_LOW',
  /** Inside the band, but moving through it faster than the method allows. */
  DRIFT = 'DRIFT',
}

export enum ExcursionSeverity {
  /** Short and shallow. Recorded, nothing withdrawn. */
  MINOR = 'MINOR',
  /** Long enough or far enough that the work in the room has to be looked at. */
  SIGNIFICANT = 'SIGNIFICANT',
  /** The room was not fit to work in. Everything issued in it is in question. */
  MAJOR = 'MAJOR',
}

/** The band a room is held to, and how fast it may move inside it. */
export interface EnvironmentLimit {
  readonly temperatureMin: number;
  readonly temperatureMax: number;
  readonly humidityMin: number | null;
  readonly humidityMax: number | null;
  /** Degrees per hour the method tolerates, null when it does not care. */
  readonly driftPerHour: number | null;
}

export interface Reading {
  readonly takenAt: string;
  readonly temperature: number;
  readonly humidity: number | null;
}

export interface Excursion {
  readonly kind: ExcursionKind;
  readonly startedAt: string;
  /** Null while the room is still outside the band at the last reading. */
  readonly endedAt: string | null;
  readonly severity: ExcursionSeverity;
  /** The furthest the room got from the limit it broke. */
  readonly worstValue: number;
  readonly limitValue: number;
  readonly readings: number;
  readonly hours: number;
}

/** Anything longer than this is significant however small the overshoot. */
const SIGNIFICANT_HOURS = 2;
const MAJOR_HOURS = 8;

/** A multiple of the band width. Half a band out is major however brief. */
const SIGNIFICANT_FRACTION = 0.1;
const MAJOR_FRACTION = 0.5;

/** Which limit a reading breaks, or nothing when it is inside the band. */
export function breachOf(reading: Reading, limit: EnvironmentLimit): ExcursionKind | null {
  if (reading.temperature > limit.temperatureMax) {
    return ExcursionKind.TEMPERATURE_HIGH;
  }
  if (reading.temperature < limit.temperatureMin) {
    return ExcursionKind.TEMPERATURE_LOW;
  }
  if (reading.humidity === null) {
    return null;
  }
  if (limit.humidityMax !== null && reading.humidity > limit.humidityMax) {
    return ExcursionKind.HUMIDITY_HIGH;
  }
  if (limit.humidityMin !== null && reading.humidity < limit.humidityMin) {
    return ExcursionKind.HUMIDITY_LOW;
  }
  return null;
}

/** The limit a kind of breach is measured against. */
export function limitFor(kind: ExcursionKind, limit: EnvironmentLimit): number {
  switch (kind) {
    case ExcursionKind.TEMPERATURE_HIGH:
      return limit.temperatureMax;
    case ExcursionKind.TEMPERATURE_LOW:
      return limit.temperatureMin;
    case ExcursionKind.HUMIDITY_HIGH:
      return limit.humidityMax ?? 0;
    case ExcursionKind.HUMIDITY_LOW:
      return limit.humidityMin ?? 0;
    case ExcursionKind.DRIFT:
      return limit.driftPerHour ?? 0;
    default:
      return 0;
  }
}

/** The value a kind of breach is judged on. */
export function valueFor(kind: ExcursionKind, reading: Reading): number {
  switch (kind) {
    case ExcursionKind.TEMPERATURE_HIGH:
    case ExcursionKind.TEMPERATURE_LOW:
      return reading.temperature;
    default:
      return reading.humidity ?? 0;
  }
}

/**
 * How bad it was.
 *
 * <p>Two independent measures, and the worse one wins. Duration catches the
 * slow failures that never go far, magnitude catches the sharp ones that are
 * over in minutes, and a rule that used only one of them would miss whichever
 * kind the laboratory happened not to have had yet.
 */
export function severityOf(
  overshoot: number,
  hours: number,
  bandWidth: number,
): ExcursionSeverity {
  const fraction = bandWidth > 0 ? Math.abs(overshoot) / bandWidth : 0;

  if (hours >= MAJOR_HOURS || fraction >= MAJOR_FRACTION) {
    return ExcursionSeverity.MAJOR;
  }
  if (hours >= SIGNIFICANT_HOURS || fraction >= SIGNIFICANT_FRACTION) {
    return ExcursionSeverity.SIGNIFICANT;
  }
  return ExcursionSeverity.MINOR;
}

/**
 * Every excursion in a run of readings.
 *
 * <p>Readings are taken in the order given. A gap in the stream ends the run:
 * a logger that stopped for three hours has told us nothing about those three
 * hours, and stitching across the gap would invent an excursion nobody
 * measured. That is the failure this replaced.
 */
export function findExcursions(
  readings: readonly Reading[],
  limit: EnvironmentLimit,
  maxGapHours = 2,
): readonly Excursion[] {
  const found: Excursion[] = [];
  let open: {
    kind: ExcursionKind;
    startedAt: string;
    lastAt: string;
    worst: number;
    overshoot: number;
    count: number;
  } | null = null;

  const close = (endedAt: string | null): void => {
    if (!open) {
      return;
    }
    const hours = hoursBetween(open.startedAt, endedAt ?? open.lastAt);

    found.push({
      kind: open.kind,
      startedAt: open.startedAt,
      endedAt,
      severity: severityOf(open.overshoot, hours, bandWidthFor(open.kind, limit)),
      worstValue: open.worst,
      limitValue: limitFor(open.kind, limit),
      readings: open.count,
      hours,
    });
    open = null;
  };

  let previous: Reading | null = null;

  for (const reading of readings) {
    if (previous && hoursBetween(previous.takenAt, reading.takenAt) > maxGapHours) {
      close(previous.takenAt);
    }
    const kind = breachOf(reading, limit);

    if (kind === null) {
      close(reading.takenAt);
    } else if (open && open.kind === kind) {
      const value = valueFor(kind, reading);
      const overshoot = value - limitFor(kind, limit);

      open.lastAt = reading.takenAt;
      open.count += 1;
      if (Math.abs(overshoot) > Math.abs(open.overshoot)) {
        open.overshoot = overshoot;
        open.worst = value;
      }
    } else {
      close(reading.takenAt);
      const value = valueFor(kind, reading);

      open = {
        kind,
        startedAt: reading.takenAt,
        lastAt: reading.takenAt,
        worst: value,
        overshoot: value - limitFor(kind, limit),
        count: 1,
      };
    }
    previous = reading;
  }

  close(null);
  return found;
}

/**
 * Rate of change breaches, which are a separate pass because they are about
 * pairs of readings rather than about single ones. A room that walks from the
 * bottom of the band to the top in twenty minutes never leaves the band and is
 * still not a room anybody should be measuring in.
 */
export function findDrift(
  readings: readonly Reading[],
  limit: EnvironmentLimit,
): readonly Excursion[] {
  if (limit.driftPerHour === null || readings.length < 2) {
    return [];
  }
  const found: Excursion[] = [];

  for (let i = 1; i < readings.length; i += 1) {
    const hours = hoursBetween(readings[i - 1].takenAt, readings[i].takenAt);

    if (hours <= 0) {
      continue;
    }
    const rate = Math.abs(readings[i].temperature - readings[i - 1].temperature) / hours;

    if (rate > limit.driftPerHour) {
      found.push({
        kind: ExcursionKind.DRIFT,
        startedAt: readings[i - 1].takenAt,
        endedAt: readings[i].takenAt,
        severity: severityOf(rate - limit.driftPerHour, hours, limit.driftPerHour),
        worstValue: round(rate, 2),
        limitValue: limit.driftPerHour,
        readings: 2,
        hours,
      });
    }
  }
  return found;
}

/** True when a moment falls inside an excursion, an open one included. */
export function covers(excursion: Excursion, at: string): boolean {
  if (at < excursion.startedAt) {
    return false;
  }
  return excursion.endedAt === null || at <= excursion.endedAt;
}

/** The width of the band a kind of breach was measured against. */
export function bandWidthFor(kind: ExcursionKind, limit: EnvironmentLimit): number {
  switch (kind) {
    case ExcursionKind.TEMPERATURE_HIGH:
    case ExcursionKind.TEMPERATURE_LOW:
      return limit.temperatureMax - limit.temperatureMin;
    case ExcursionKind.HUMIDITY_HIGH:
    case ExcursionKind.HUMIDITY_LOW:
      return (limit.humidityMax ?? 0) - (limit.humidityMin ?? 0);
    default:
      return limit.driftPerHour ?? 0;
  }
}

export function hoursBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 3_600_000;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
