import {
  ATTEMPT_LIMIT,
  QueuedWrite,
  STALENESS_MS,
  describeQueue,
  isExhausted,
  isReplayable,
  isStale,
  kindFor,
  parked,
  queued,
  readQueue,
  replayable,
  withFailure,
  writeQueue,
} from '@core/offline/queue.model';

const NOW = 1_770_000_000_000;

function write(overrides: Partial<QueuedWrite> = {}): QueuedWrite {
  return { ...queued('USAGE', { assetTag: 'SG-000101' }, 'SG-000101 on WO-1', NOW), ...overrides };
}

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

describe('what may be queued', () => {
  it('queues a usage write', () => {
    expect(isReplayable('/api/usage')).toBe(true);
    expect(kindFor('http://localhost/api/usage')).toBe('USAGE');
  });

  it('refuses to queue anything else', () => {
    expect(isReplayable('/api/certificates')).toBe(false);
    expect(isReplayable('/api/instruments')).toBe(false);
    expect(kindFor('/api/certificates')).toBeNull();
  });

  it('gives every write its own id', () => {
    expect(write().id).not.toBe(write().id);
  });

  it('starts with no attempts against it', () => {
    expect(write().attempts).toBe(0);
    expect(write().lastError).toBeUndefined();
  });
});

describe('failing and giving up', () => {
  it('counts each failure and keeps the last message', () => {
    const failed = withFailure(write(), 'unreachable');

    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe('unreachable');
  });

  it('gives up after the attempt limit', () => {
    let entry = write();
    for (let i = 0; i < ATTEMPT_LIMIT - 1; i++) {
      entry = withFailure(entry, 'unreachable');
    }

    expect(isExhausted(entry)).toBe(false);
    expect(isExhausted(withFailure(entry, 'unreachable'))).toBe(true);
  });

  it('will not replay something that has sat for a day', () => {
    expect(isStale(write(), NOW + STALENESS_MS - 1)).toBe(false);
    expect(isStale(write(), NOW + STALENESS_MS + 1)).toBe(true);
  });
});

describe('choosing what to send', () => {
  const queue = [
    write({ id: 'a', queuedAt: NOW + 200 }),
    write({ id: 'b', queuedAt: NOW }),
    write({ id: 'c', queuedAt: NOW + 100, attempts: ATTEMPT_LIMIT }),
    write({ id: 'd', queuedAt: NOW - STALENESS_MS - 1 }),
  ];

  it('sends the oldest first so the log keeps its order', () => {
    expect(replayable(queue, NOW + 1000).map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('parks what has failed too often or sat too long', () => {
    expect(parked(queue, NOW + 1000).map((entry) => entry.id)).toEqual(['c', 'd']);
  });

  it('says plainly what is in the queue', () => {
    expect(describeQueue([], NOW)).toBe('nothing waiting');
    expect(describeQueue([write()], NOW)).toBe('1 waiting to send');
    expect(describeQueue([write({ attempts: ATTEMPT_LIMIT })], NOW)).toBe(
      '1 could not be sent',
    );
    expect(describeQueue(queue, NOW + 1000)).toBe('2 waiting, 2 could not be sent');
  });
});

describe('surviving a reload', () => {
  it('writes the queue out and reads it back', () => {
    const storage = fakeStorage();
    const queue = [write({ id: 'a' }), write({ id: 'b' })];

    writeQueue(storage, queue);

    expect(readQueue(storage).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('starts empty when nothing was stored', () => {
    expect(readQueue(fakeStorage())).toEqual([]);
  });

  it('drops a corrupt queue rather than failing to start', () => {
    const storage = fakeStorage();
    storage.setItem('slipgauge.queue', '{not json');

    expect(readQueue(storage)).toEqual([]);
  });

  it('drops a stored value that is not a list', () => {
    const storage = fakeStorage();
    storage.setItem('slipgauge.queue', '{"a":1}');

    expect(readQueue(storage)).toEqual([]);
  });

  it('carries on when storage refuses to write', () => {
    const refusing = {
      ...fakeStorage(),
      setItem: () => {
        throw new Error('quota');
      },
    } as Storage;

    expect(() => writeQueue(refusing, [write()])).not.toThrow();
  });
});
