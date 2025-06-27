import { Page, emptyPage, pageSummary } from '@core/models/page.model';

function page(overrides: Partial<Page<number>>): Page<number> {
  return { ...emptyPage<number>(), ...overrides };
}

describe('page envelope', () => {
  it('starts empty and on the first and last page at once', () => {
    const blank = emptyPage<number>(25);

    expect(blank.items).toHaveLength(0);
    expect(blank.size).toBe(25);
    expect(blank.first).toBe(true);
    expect(blank.last).toBe(true);
  });

  it('says so plainly when nothing matched', () => {
    expect(pageSummary(emptyPage())).toBe('No instruments match');
  });

  it('counts from one rather than zero on the first page', () => {
    const first = page({ items: [1, 2, 3], page: 0, size: 50, totalItems: 3 });

    expect(pageSummary(first)).toBe('1 to 3 of 3');
  });

  it('offsets the range by the page number', () => {
    const third = page({ items: [1, 2], page: 2, size: 50, totalItems: 102 });

    expect(pageSummary(third)).toBe('101 to 102 of 102');
  });
});
