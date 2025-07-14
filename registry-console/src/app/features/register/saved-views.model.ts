import { InstrumentQuery, activeFilterCount } from '@core/models/instrument-query.model';
import { RegisterView, viewToParams } from './query-url';

/**
 * Filter sets people come back to.
 *
 * <p>Kept on the terminal rather than the account for the same reason the theme
 * is: a bench terminal belongs to a bench, and the view somebody wants on the
 * dimensional bench is the dimensional room's kit, whoever is standing at it.
 */

export interface SavedView {
  readonly id: string;
  readonly name: string;
  readonly view: RegisterView;
  readonly createdAt: number;
  readonly usedAt: number;
  readonly uses: number;
}

const STORAGE_KEY = 'slipgauge.savedViews';

/** More than this and the list stops being a shortcut. */
export const CEILING = 12;

let sequence = 0;

export function save(name: string, view: RegisterView, at = Date.now()): SavedView {
  sequence += 1;
  return {
    id: `v-${at.toString(36)}-${sequence}`,
    name: name.trim(),
    view,
    createdAt: at,
    usedAt: at,
    uses: 0,
  };
}

export function nameIsUsable(name: string, existing: readonly SavedView[]): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 40) {
    return false;
  }
  return !existing.some((entry) => entry.name.toLowerCase() === trimmed.toLowerCase());
}

/** Two views that would fetch the same rows, whatever order they were built in. */
export function sameAs(left: RegisterView, right: RegisterView): boolean {
  return JSON.stringify(viewToParams(left)) === JSON.stringify(viewToParams(right));
}

export function findMatching(
  views: readonly SavedView[],
  current: RegisterView,
): SavedView | null {
  return views.find((entry) => sameAs(entry.view, current)) ?? null;
}

export function used(entry: SavedView, at = Date.now()): SavedView {
  return { ...entry, usedAt: at, uses: entry.uses + 1 };
}

/**
 * Most used first, then most recent. A shortcut list ordered by when it was
 * created stops being a shortcut the moment somebody adds a thirteenth.
 */
export function ordered(views: readonly SavedView[]): readonly SavedView[] {
  return [...views].sort((a, b) => b.uses - a.uses || b.usedAt - a.usedAt);
}

/** Adds one, dropping the least useful if the list is already full. */
export function withAdded(
  views: readonly SavedView[],
  entry: SavedView,
): readonly SavedView[] {
  const next = [...views, entry];
  if (next.length <= CEILING) {
    return next;
  }
  const doomed = ordered(next)[next.length - 1];
  return next.filter((candidate) => candidate.id !== doomed.id);
}

export function describe(entry: SavedView): string {
  const count = activeFilterCount(entry.view.query);
  const parts: string[] = [];

  if (count === 0) {
    parts.push('everything');
  } else {
    parts.push(`${count} filter${count === 1 ? '' : 's'}`);
  }
  if (entry.view.sort !== 'assetTag') {
    parts.push(`sorted by ${readableSort(entry.view.sort)}`);
  }
  if (entry.uses > 0) {
    parts.push(`used ${entry.uses} time${entry.uses === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}

function readableSort(sort: string): string {
  const descending = sort.startsWith('-');
  const column = descending ? sort.slice(1) : sort;
  const words = column.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return descending ? `${words}, newest first` : words;
}

export function read(storage: Storage): readonly SavedView[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]).filter(isUsable) : [];
  } catch {
    return [];
  }
}

export function write(storage: Storage, views: readonly SavedView[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // A terminal with storage blocked simply forgets its shortcuts on reload.
  }
}

function isUsable(entry: unknown): entry is SavedView {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const candidate = entry as Partial<SavedView>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.view === 'object' &&
    candidate.view !== null &&
    typeof (candidate.view as RegisterView).sort === 'string' &&
    typeof (candidate.view as RegisterView).page === 'number' &&
    typeof (candidate.view as RegisterView).query === 'object'
  );
}

export function emptyView(): RegisterView {
  return { query: {} as InstrumentQuery, page: 0, sort: 'assetTag' };
}
