/**
 * The page envelope every list endpoint returns. Published by the service
 * rather than leaking whatever the ORM's own paging type happens to be this
 * month, because the console is built against this shape.
 */
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
}

export function pageOf<E, T>(
  rows: readonly E[],
  totalItems: number,
  page: number,
  size: number,
  map: (row: E) => T,
): Page<T> {
  const totalPages = size > 0 ? Math.ceil(totalItems / size) : 0;

  return {
    items: rows.map(map),
    page,
    size,
    totalItems,
    totalPages,
    first: page === 0,
    last: totalPages === 0 || page >= totalPages - 1,
  };
}

/**
 * Sorting arrives as a raw string from the console, and an ORM will happily
 * order by any column it can resolve. This maps the handful of columns we mean
 * to support onto entity paths and refuses everything else.
 */
export class SortWhitelist {
  private readonly allowed = new Map<string, string>();

  constructor(private readonly fallback: string) {}

  allow(apiName: string, entityPath?: string): this {
    this.allowed.set(apiName, entityPath ?? apiName);
    return this;
  }

  /** Page number and size, clamped into a window the database can serve. */
  paging(page: number, size: number): { skip: number; take: number; page: number; size: number } {
    const boundedSize = Math.max(1, Math.min(200, Math.trunc(size) || 1));
    const boundedPage = Math.max(0, Math.trunc(page) || 0);

    return {
      skip: boundedPage * boundedSize,
      take: boundedSize,
      page: boundedPage,
      size: boundedSize,
    };
  }

  resolve(sort: string | undefined, prefix: string): Record<string, 'ASC' | 'DESC'> {
    if (!sort || !sort.trim()) {
      return { [`${prefix}.${this.allowed.get(this.fallback) ?? this.fallback}`]: 'ASC' };
    }

    const order: Record<string, 'ASC' | 'DESC'> = {};

    for (const clause of sort.split(',')) {
      const trimmed = clause.trim();
      if (!trimmed) {
        continue;
      }
      const descending = trimmed.startsWith('-');
      const name = descending ? trimmed.slice(1) : trimmed;
      const path = this.allowed.get(name);

      if (!path) {
        throw new Error(
          `cannot sort by ${name}, allowed columns are ${[...this.allowed.keys()].join(', ')}`,
        );
      }
      order[qualify(path, prefix)] = descending ? 'DESC' : 'ASC';
    }

    if (Object.keys(order).length === 0) {
      return { [`${prefix}.${this.allowed.get(this.fallback) ?? this.fallback}`]: 'ASC' };
    }
    return order;
  }
}

/** A path already naming a relation keeps it; a bare column gets the root alias. */
function qualify(path: string, prefix: string): string {
  return path.includes('.') ? path : `${prefix}.${path}`;
}
