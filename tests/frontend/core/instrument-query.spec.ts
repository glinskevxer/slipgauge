import {
  activeFilterCount,
  queryToParams,
} from '@core/models/instrument-query.model';

describe('register filter query', () => {
  it('counts nothing when no filter is set', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ text: '   ' })).toBe(0);
  });

  it('counts a date range as one filter rather than two', () => {
    expect(activeFilterCount({ acquiredFrom: '2024-01-01', acquiredTo: '2024-12-31' })).toBe(1);
    expect(activeFilterCount({ acquiredFrom: '2024-01-01' })).toBe(1);
  });

  it('counts each independent facet separately', () => {
    const count = activeFilterCount({
      text: 'mitutoyo',
      statuses: ['IN_SERVICE'],
      disciplines: ['DIMENSIONAL'],
      referenceOnly: true,
    });

    expect(count).toBe(4);
  });

  it('trims the free text before sending it', () => {
    expect(queryToParams({ text: '  SG-0001  ' })['text']).toBe('SG-0001');
  });

  it('drops empty lists so an absent filter is not sent as a blank one', () => {
    const params = queryToParams({ statuses: [], disciplines: [], text: '' });

    expect(Object.keys(params)).toHaveLength(0);
  });

  it('keeps repeated values as an array for the http layer to append', () => {
    const params = queryToParams({ statuses: ['IN_SERVICE', 'ON_LOAN'] });

    expect(params['statuses']).toEqual(['IN_SERVICE', 'ON_LOAN']);
  });

  it('only sends the boolean flags when they are actually on', () => {
    expect(queryToParams({ referenceOnly: false, includeRetired: false })).toEqual({});
    expect(queryToParams({ referenceOnly: true, includeRetired: true })).toEqual({
      referenceOnly: 'true',
      includeRetired: 'true',
    });
  });
});
