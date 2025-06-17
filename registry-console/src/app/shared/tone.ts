/**
 * The one vocabulary the console colours by.
 *
 * <p>Eight files had each declared their own union of the same five strings,
 * and they had drifted: two of them had no neutral, one spelled the unknown
 * case differently, and the stylesheets carried selectors for a tone nothing
 * produced any more. A tone is a presentation decision, so it belongs in one
 * place, and every mapping from a domain value onto one lives beside it.
 */
export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'quiet' | 'unknown';

/** Fractions of a permitted band, used by the drift chart and the point table. */
export function toneForBandPosition(normalised: number): Tone {
  const magnitude = Math.abs(normalised);
  if (magnitude > 1) {
    return 'bad';
  }
  return magnitude > 0.7 ? 'warn' : 'ok';
}

/**
 * Tolerance half width over expanded uncertainty. Under one there is no
 * statement to make at all, and under four the acceptance limits get pulled in.
 */
export function toneForTestRatio(ratio: number | null): Tone {
  if (ratio === null || !Number.isFinite(ratio)) {
    return 'ok';
  }
  if (ratio < 1) {
    return 'bad';
  }
  return ratio < 4 ? 'warn' : 'ok';
}

/** Days until something is due, negative when it is already late. */
export function toneForDueIn(days: number): Tone {
  if (!Number.isFinite(days) || days > 100000) {
    return 'unknown';
  }
  if (days < 0) {
    return 'bad';
  }
  return days <= 7 ? 'warn' : 'ok';
}
