import { ExpiringCache } from '@registry/common/expiring-cache';

function cacheOf<V>(ttlMs = 1000, ceiling = 3) {
  let clock = 0;
  const cache = new ExpiringCache<string, V>({ ttlMs, ceiling }, () => clock);

  return { cache, tick: (ms: number) => (clock += ms) };
}

describe('an expiring cache', () => {
  it('hands back what was put in', () => {
    const { cache } = cacheOf<number>();

    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('knows nothing about a key it has never seen', () => {
    const { cache } = cacheOf<number>();

    expect(cache.get('a')).toBeUndefined();
  });

  it('forgets an entry once its window is past', () => {
    const { cache, tick } = cacheOf<number>(1000);

    cache.set('a', 1);
    tick(999);
    expect(cache.get('a')).toBe(1);

    tick(2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('drops the oldest when the ceiling is reached', () => {
    const { cache } = cacheOf<number>(1000, 3);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('does not evict when a key already held is written again', () => {
    const { cache } = cacheOf<number>(1000, 2);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 9);

    expect(cache.get('a')).toBe(9);
    expect(cache.get('b')).toBe(2);
  });

  it('drops one key without touching the rest', () => {
    const { cache } = cacheOf<number>();

    cache.set('a', 1);
    cache.set('b', 2);
    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('empties completely when told to', () => {
    const { cache } = cacheOf<number>();

    cache.set('a', 1);
    cache.clear();

    expect(cache.size).toBe(0);
  });
});

describe('reading through', () => {
  it('loads once and then answers from memory', async () => {
    const { cache } = cacheOf<number>();
    let loads = 0;

    const load = async () => {
      loads += 1;
      return 7;
    };

    expect(await cache.through('a', load)).toBe(7);
    expect(await cache.through('a', load)).toBe(7);
    expect(loads).toBe(1);
  });

  it('loads again once the window is past', async () => {
    const { cache, tick } = cacheOf<number>(1000);
    let loads = 0;

    const load = async () => {
      loads += 1;
      return 7;
    };

    await cache.through('a', load);
    tick(1001);
    await cache.through('a', load);

    expect(loads).toBe(2);
  });

  it('never stores an absence', async () => {
    const { cache } = cacheOf<number>();
    let loads = 0;

    const missing = async () => {
      loads += 1;
      return undefined;
    };

    expect(await cache.through('a', missing)).toBeUndefined();
    expect(await cache.through('a', missing)).toBeUndefined();
    expect(loads).toBe(2);
    expect(cache.size).toBe(0);
  });
});

describe('the counters', () => {
  it('counts a hit and a miss separately', () => {
    const { cache } = cacheOf<number>();

    cache.get('a');
    cache.set('a', 1);
    cache.get('a');
    cache.get('a');

    expect(cache.stats()).toEqual({ hits: 2, misses: 1, entries: 1 });
  });

  it('counts an expiry as a miss', () => {
    const { cache, tick } = cacheOf<number>(100);

    cache.set('a', 1);
    tick(101);
    cache.get('a');

    expect(cache.stats().misses).toBe(1);
  });

  it('can be zeroed without emptying the cache', () => {
    const { cache } = cacheOf<number>();

    cache.set('a', 1);
    cache.get('a');
    cache.resetStats();

    expect(cache.stats()).toEqual({ hits: 0, misses: 0, entries: 1 });
    expect(cache.get('a')).toBe(1);
  });
});
