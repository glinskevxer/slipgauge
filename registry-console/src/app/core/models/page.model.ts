/** The envelope every list endpoint returns. Mirrors PageResponse on the service. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
}

export function emptyPage<T>(size = 50): Page<T> {
  return {
    items: [],
    page: 0,
    size,
    totalItems: 0,
    totalPages: 0,
    first: true,
    last: true,
  };
}

/** Human sentence for the row counter above a grid. */
export function pageSummary(page: Page<unknown>): string {
  if (page.totalItems === 0) {
    return 'No instruments match';
  }
  const from = page.page * page.size + 1;
  const to = Math.min(page.totalItems, from + page.items.length - 1);
  return `${from} to ${to} of ${page.totalItems}`;
}
