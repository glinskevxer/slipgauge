/**
 * What each terminal remembers about how it likes to be used.
 *
 * <p>Deliberately per terminal rather than per person. A bench terminal is
 * shared across shifts and lives on a fixed screen at a fixed distance; the
 * density and the theme belong to the machine, not to whoever is signed in.
 */

export type Theme = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

export interface Preferences {
  readonly theme: Theme;
  readonly density: Density;
  /** Rows fetched per page on the register. */
  readonly pageSize: number;
  /** Whether the register hides retired instruments by default. */
  readonly hideRetired: boolean;
  /** How far ahead the recall board looks when it opens. */
  readonly recallHorizonDays: number;
  /** Bench hours a week, used by the capacity board. */
  readonly capacityHours: number;
  /** Whether a use with no work order raises a warning. */
  readonly warnUntraceableUse: boolean;
}

export const DEFAULTS: Preferences = {
  theme: 'system',
  density: 'comfortable',
  pageSize: 50,
  hideRetired: true,
  recallHorizonDays: 60,
  capacityHours: 24,
  warnUntraceableUse: true,
};

const PAGE_SIZES = [25, 50, 100, 200] as const;
const HORIZONS = [14, 30, 60, 90, 180, 365] as const;

export const PAGE_SIZE_CHOICES: readonly number[] = PAGE_SIZES;
export const HORIZON_CHOICES: readonly number[] = HORIZONS;

/**
 * Reads whatever was stored and returns something usable.
 *
 * <p>Every field is checked rather than trusted. Preferences survive upgrades,
 * and a value written by a version that has since changed its mind must not be
 * able to put the console into a state nobody can get out of.
 */
export function sanitise(raw: unknown): Preferences {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULTS;
  }
  const value = raw as Partial<Record<keyof Preferences, unknown>>;

  return {
    theme: oneOf(value.theme, ['system', 'light', 'dark'] as const, DEFAULTS.theme),
    density: oneOf(value.density, ['comfortable', 'compact'] as const, DEFAULTS.density),
    pageSize: numberIn(value.pageSize, PAGE_SIZES, DEFAULTS.pageSize),
    hideRetired: boolean(value.hideRetired, DEFAULTS.hideRetired),
    recallHorizonDays: numberIn(value.recallHorizonDays, HORIZONS, DEFAULTS.recallHorizonDays),
    capacityHours: clamp(value.capacityHours, 1, 200, DEFAULTS.capacityHours),
    warnUntraceableUse: boolean(value.warnUntraceableUse, DEFAULTS.warnUntraceableUse),
  };
}

export function isDefault(preferences: Preferences): boolean {
  return (Object.keys(DEFAULTS) as Array<keyof Preferences>).every(
    (key) => preferences[key] === DEFAULTS[key],
  );
}

/** The attribute the document carries so the stylesheet can pick a theme. */
export function themeAttribute(theme: Theme): string | null {
  return theme === 'system' ? null : theme;
}

export function densityClass(density: Density): string {
  return density === 'compact' ? 'sg-compact' : '';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function numberIn(value: unknown, allowed: readonly number[], fallback: number): number {
  return typeof value === 'number' && allowed.includes(value) ? value : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: unknown, low: number, high: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(Math.max(low, Math.min(high, value)));
}
