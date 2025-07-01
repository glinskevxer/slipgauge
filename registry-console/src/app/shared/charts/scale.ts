/**
 * The two scales the charts need, kept as plain functions rather than pulling
 * in a plotting library. The console draws three chart types in total and each
 * one is a handful of paths; a charting dependency would be larger than the
 * feature that uses it and would fight the theme tokens.
 */

export interface LinearScale {
  (value: number): number;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  invert(pixel: number): number;
  ticks(count: number): readonly number[];
}

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;

  const scale = ((value: number) => {
    if (span === 0) {
      return (r0 + r1) / 2;
    }
    return r0 + ((value - d0) / span) * (r1 - r0);
  }) as {
    (value: number): number;
    domain: readonly [number, number];
    range: readonly [number, number];
    invert(pixel: number): number;
    ticks(count: number): readonly number[];
  };

  scale.domain = domain;
  scale.range = range;
  scale.invert = (pixel: number) => {
    if (r1 === r0) {
      return d0;
    }
    return d0 + ((pixel - r0) / (r1 - r0)) * span;
  };
  scale.ticks = (count: number) => niceTicks(d0, d1, count);

  return scale as LinearScale;
}

/**
 * Tick values a person would have chosen: multiples of one, two or five times
 * a power of ten, covering the domain.
 */
export function niceTicks(low: number, high: number, count: number): readonly number[] {
  if (!Number.isFinite(low) || !Number.isFinite(high) || count < 1) {
    return [];
  }
  if (low === high) {
    return [low];
  }
  const rawStep = (high - low) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep))));
  const normalised = rawStep / magnitude;
  const step = (normalised >= 5 ? 5 : normalised >= 2 ? 2 : 1) * magnitude;

  const first = Math.ceil(low / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= high + step / 1000; value += step) {
    // Multiplying back up avoids the drift that repeated addition accumulates.
    ticks.push(Number((Math.round(value / step) * step).toPrecision(12)));
  }
  return ticks;
}

/** Widens a domain by a fraction on each side so points do not sit on the frame. */
export function padDomain(
  domain: readonly [number, number],
  fraction = 0.08,
): readonly [number, number] {
  const [low, high] = domain;
  if (low === high) {
    const nudge = Math.abs(low) * fraction || 1;
    return [low - nudge, high + nudge];
  }
  const pad = (high - low) * fraction;
  return [low - pad, high + pad];
}

export function extent(values: readonly number[]): readonly [number, number] | null {
  if (values.length === 0) {
    return null;
  }
  let low = values[0];
  let high = values[0];
  for (const value of values) {
    if (value < low) {low = value;}
    if (value > high) {high = value;}
  }
  return [low, high];
}
