/**
 * A small map that forgets.
 *
 * <p>Written rather than pulled in because the three things a cache in this
 * service has to get right are all things a general one leaves to the caller:
 * it has to be cleared when the thing it holds is written to, it has to have a
 * ceiling so a long running process cannot grow without bound, and it has to be
 * possible to prove it is off in a test.
 *
 * <p>Deliberately not keyed on anything a request supplies. Everything cached
 * here is reference data the laboratory changes a few times a year, and a cache
 * keyed on user input is a cache somebody can fill.
 */
export interface CacheOptions {
  /** How long an entry stands. */
  readonly ttlMs: number;
  /** The most entries kept. The oldest goes when a new one would exceed it. */
  readonly ceiling: number;
}

interface Entry<V> {
  readonly value: V;
  readonly storedAt: number;
}

export class ExpiringCache<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
  private hitCount = 0;
  private missCount = 0;

  constructor(
    private readonly options: CacheOptions,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: K): V | undefined {
    const held = this.entries.get(key);

    if (!held) {
      this.missCount += 1;
      return undefined;
    }
    if (this.now() - held.storedAt > this.options.ttlMs) {
      this.entries.delete(key);
      this.missCount += 1;
      return undefined;
    }
    this.hitCount += 1;
    return held.value;
  }

  set(key: K, value: V): void {
    // Insertion ordered, so the first key is the oldest. One at a time rather
    // than a sweep: the ceiling is only ever exceeded by one.
    if (!this.entries.has(key) && this.entries.size >= this.options.ceiling) {
      const oldest = this.entries.keys().next();

      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, { value, storedAt: this.now() });
  }

  /**
   * Reads through, storing what the loader returned.
   *
   * <p>An undefined answer is not stored. "There is no profile for this class"
   * is a state that changes the moment somebody writes one, and caching it
   * would leave a bench unable to file a sheet for the rest of the window.
   */
  async through(key: K, load: () => Promise<V | undefined>): Promise<V | undefined> {
    const held = this.get(key);

    if (held !== undefined) {
      return held;
    }
    const loaded = await load();

    if (loaded !== undefined) {
      this.set(key, loaded);
    }
    return loaded;
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Hits and misses since the last reset, for the metrics endpoint. */
  stats(): { hits: number; misses: number; entries: number } {
    return { hits: this.hitCount, misses: this.missCount, entries: this.entries.size };
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }
}
