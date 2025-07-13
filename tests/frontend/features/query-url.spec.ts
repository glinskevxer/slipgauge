import {
  RegisterView,
  paramsToView,
  sameView,
  viewToParams,
} from '@features/register/query-url';

function view(overrides: Partial<RegisterView> = {}): RegisterView {
  return { query: {}, page: 0, sort: 'assetTag', ...overrides };
}

describe('writing a register view into the address bar', () => {
  it('writes nothing at all for an untouched register', () => {
    expect(viewToParams(view())).toEqual({});
  });

  it('writes the free text under a short key', () => {
    expect(viewToParams(view({ query: { text: ' mahr ' } }))).toEqual({ q: 'mahr' });
  });

  it('joins a list with commas rather than repeating the key', () => {
    const params = viewToParams(
      view({ query: { statuses: ['IN_SERVICE', 'QUARANTINED'] } }),
    );

    expect(params['status']).toBe('IN_SERVICE,QUARANTINED');
  });

  it('counts pages from one so the address bar reads the way the pager does', () => {
    expect(viewToParams(view({ page: 0 }))['page']).toBeUndefined();
    expect(viewToParams(view({ page: 2 }))['page']).toBe('3');
  });

  it('leaves the default sort out', () => {
    expect(viewToParams(view({ sort: 'assetTag' }))['sort']).toBeUndefined();
    expect(viewToParams(view({ sort: '-model' }))['sort']).toBe('-model');
  });

  it('writes the flags only when they are on', () => {
    expect(viewToParams(view({ query: { referenceOnly: false } }))).toEqual({});
    expect(viewToParams(view({ query: { referenceOnly: true } }))).toEqual({ standards: '1' });
  });
});

describe('reading a register view back out', () => {
  it('gives an empty register for an empty address', () => {
    expect(paramsToView({})).toEqual(view());
  });

  it('round trips everything the filter bar can express', () => {
    const original = view({
      query: {
        text: 'mitutoyo',
        statuses: ['IN_SERVICE'],
        disciplines: ['DIMENSIONAL', 'MASS'],
        criticalities: ['CRITICAL'],
        classCode: 'MIC-EXT',
        locationCode: 'HARLOW-DIM',
        referenceOnly: true,
        includeRetired: true,
        acquiredFrom: '2024-01-01',
        acquiredTo: '2024-12-31',
      },
      page: 3,
      sort: '-status',
    });

    expect(paramsToView(viewToParams(original))).toEqual(original);
  });

  it('drops a status that is not one of ours', () => {
    expect(paramsToView({ status: 'IN_SERVICE,NONSENSE' }).query.statuses).toEqual([
      'IN_SERVICE',
    ]);
  });

  it('drops the whole list when none of it is recognised', () => {
    expect(paramsToView({ discipline: 'MADE,UP' }).query.disciplines).toBeUndefined();
  });

  it('accepts a lowercase enum from a hand typed link', () => {
    expect(paramsToView({ status: 'in_service' }).query.statuses).toEqual(['IN_SERVICE']);
  });

  it('removes a repeated value rather than sending it twice', () => {
    expect(paramsToView({ status: 'IN_SERVICE,IN_SERVICE' }).query.statuses).toEqual([
      'IN_SERVICE',
    ]);
  });

  it('refuses a date that is not a date', () => {
    expect(paramsToView({ from: 'yesterday' }).query.acquiredFrom).toBeUndefined();
    expect(paramsToView({ from: '2024-01-01' }).query.acquiredFrom).toBe('2024-01-01');
  });

  it('falls back to the first page for anything that is not a page number', () => {
    expect(paramsToView({ page: '0' }).page).toBe(0);
    expect(paramsToView({ page: '-2' }).page).toBe(0);
    expect(paramsToView({ page: 'two' }).page).toBe(0);
    expect(paramsToView({ page: '4' }).page).toBe(3);
  });

  it('falls back to the default sort for a column that cannot be sorted', () => {
    expect(paramsToView({ sort: 'instrumentClass.criticality' }).sort).toBe('assetTag');
    expect(paramsToView({ sort: '-acquiredOn' }).sort).toBe('-acquiredOn');
  });

  it('treats a truncated link as an empty register rather than failing', () => {
    expect(paramsToView({ q: '', status: '', page: '' })).toEqual(view());
  });
});

describe('comparing views', () => {
  it('calls two views the same when they would fetch the same rows', () => {
    expect(sameView(view({ query: { text: 'a' } }), view({ query: { text: ' a ' } }))).toBe(true);
  });

  it('notices a different page', () => {
    expect(sameView(view({ page: 0 }), view({ page: 1 }))).toBe(false);
  });
});
