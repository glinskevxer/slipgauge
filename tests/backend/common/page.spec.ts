import { SortWhitelist, pageOf } from '@registry/common/page';

describe('page envelope', () => {
  it('reports a single full page as both first and last', () => {
    const page = pageOf([1, 2, 3], 3, 0, 50, (row) => row);

    expect(page.totalPages).toBe(1);
    expect(page.first).toBe(true);
    expect(page.last).toBe(true);
  });

  it('works the page count out from the total, not the rows returned', () => {
    const page = pageOf([1, 2], 102, 0, 50, (row) => row);

    expect(page.totalPages).toBe(3);
    expect(page.last).toBe(false);
  });

  it('calls an empty result both first and last', () => {
    const page = pageOf([], 0, 0, 50, (row) => row);

    expect(page.totalPages).toBe(0);
    expect(page.first).toBe(true);
    expect(page.last).toBe(true);
  });

  it('knows the last page when it is only partly full', () => {
    const page = pageOf([1, 2], 102, 2, 50, (row) => row);

    expect(page.first).toBe(false);
    expect(page.last).toBe(true);
  });

  it('maps every row on the way out', () => {
    expect(pageOf([1, 2], 2, 0, 50, (row) => row * 10).items).toEqual([10, 20]);
  });
});

describe('sort whitelist', () => {
  const whitelist = new SortWhitelist('assetTag')
    .allow('assetTag')
    .allow('status')
    .allow('classCode', 'type.code');

  it('falls back to the declared default when nothing is asked for', () => {
    expect(whitelist.resolve(undefined, 'i')).toEqual({ 'i.assetTag': 'ASC' });
    expect(whitelist.resolve('   ', 'i')).toEqual({ 'i.assetTag': 'ASC' });
  });

  it('reads a leading minus as descending', () => {
    expect(whitelist.resolve('-status', 'i')).toEqual({ 'i.status': 'DESC' });
  });

  it('rewrites an api name to its entity path and leaves the alias alone', () => {
    expect(whitelist.resolve('classCode', 'i')).toEqual({ 'type.code': 'ASC' });
  });

  it('keeps several clauses in the order they were written', () => {
    expect(Object.keys(whitelist.resolve('status,-assetTag', 'i'))).toEqual([
      'i.status',
      'i.assetTag',
    ]);
  });

  it('refuses a column nobody allowed rather than passing it to the database', () => {
    expect(() => whitelist.resolve('instrumentClass.criticality', 'i')).toThrow('cannot sort by');
  });

  it('clamps the page and the size into a window the database can serve', () => {
    expect(whitelist.paging(-3, 0)).toEqual({ skip: 0, take: 1, page: 0, size: 1 });
    expect(whitelist.paging(2, 5000)).toEqual({ skip: 400, take: 200, page: 2, size: 200 });
  });

  it('works the offset out from the clamped size, not the asked for one', () => {
    expect(whitelist.paging(3, 25)).toEqual({ skip: 75, take: 25, page: 3, size: 25 });
  });
});
