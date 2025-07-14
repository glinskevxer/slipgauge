import {
  CEILING,
  SavedView,
  describe as describeView,
  emptyView,
  findMatching,
  nameIsUsable,
  ordered,
  read,
  sameAs,
  save,
  used,
  withAdded,
  write,
} from '@features/register/saved-views.model';
import { RegisterView } from '@features/register/query-url';

function view(overrides: Partial<RegisterView> = {}): RegisterView {
  return { ...emptyView(), ...overrides };
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

describe('naming a view', () => {
  const existing = [save('Dimensional room', view())];

  it('refuses a blank name', () => {
    expect(nameIsUsable('', existing)).toBe(false);
    expect(nameIsUsable('   ', existing)).toBe(false);
  });

  it('refuses a name that will not fit in the list', () => {
    expect(nameIsUsable('x'.repeat(41), existing)).toBe(false);
    expect(nameIsUsable('x'.repeat(40), existing)).toBe(true);
  });

  it('refuses a name already taken, whatever the case', () => {
    expect(nameIsUsable('dimensional room', existing)).toBe(false);
    expect(nameIsUsable('Electrical room', existing)).toBe(true);
  });
});

describe('matching the current view', () => {
  it('calls two views the same when they would fetch the same rows', () => {
    expect(sameAs(view({ query: { text: 'a' } }), view({ query: { text: ' a ' } }))).toBe(true);
  });

  it('finds the saved view a person is already looking at', () => {
    const saved = [save('Standards', view({ query: { referenceOnly: true } }))];

    expect(findMatching(saved, view({ query: { referenceOnly: true } }))?.name).toBe('Standards');
    expect(findMatching(saved, view())).toBeNull();
  });
});

describe('ordering the list', () => {
  it('puts the most used first', () => {
    const rarely = { ...save('Rarely', view()), uses: 1 };
    const often = { ...save('Often', view({ sort: '-model' })), uses: 9 };

    expect(ordered([rarely, often]).map((entry) => entry.name)).toEqual(['Often', 'Rarely']);
  });

  it('breaks a tie on how recently it was used', () => {
    const older = { ...save('Older', view()), uses: 2, usedAt: 1000 };
    const newer = { ...save('Newer', view({ sort: '-model' })), uses: 2, usedAt: 2000 };

    expect(ordered([older, newer])[0].name).toBe('Newer');
  });

  it('counts a use and stamps the time', () => {
    const entry = save('Standards', view(), 1000);
    const after = used(entry, 5000);

    expect(after.uses).toBe(1);
    expect(after.usedAt).toBe(5000);
    expect(entry.uses).toBe(0);
  });
});

describe('keeping the list a shortcut', () => {
  function fill(count: number): SavedView[] {
    return Array.from({ length: count }, (_, index) => ({
      ...save(`View ${index}`, view({ sort: index % 2 ? '-model' : 'assetTag' })),
      uses: index,
    }));
  }

  it('adds while there is room', () => {
    expect(withAdded(fill(3), save('One more', view()))).toHaveLength(4);
  });

  it('drops the least useful once it is full', () => {
    const full = fill(CEILING);

    const after = withAdded(full, { ...save('Newcomer', view()), uses: 5 });

    expect(after).toHaveLength(CEILING);
    expect(after.map((entry) => entry.name)).toContain('Newcomer');
    expect(after.map((entry) => entry.name)).not.toContain('View 0');
  });
});

describe('describing a view', () => {
  it('says everything when nothing is filtered', () => {
    expect(describeView(save('All', view()))).toBe('everything');
  });

  it('counts the filters', () => {
    expect(
      describeView(save('Two', view({ query: { text: 'a', referenceOnly: true } }))),
    ).toBe('2 filters');
  });

  it('mentions a sort that is not the default', () => {
    expect(describeView(save('Newest', view({ sort: '-acquiredOn' })))).toContain(
      'sorted by acquired on, newest first',
    );
  });

  it('mentions how often it has been used', () => {
    expect(describeView({ ...save('Often', view()), uses: 4 })).toContain('used 4 times');
  });
});

describe('surviving a reload', () => {
  it('writes and reads the list back', () => {
    const storage = fakeStorage();
    write(storage, [save('Standards', view({ query: { referenceOnly: true } }))]);

    expect(read(storage)[0].name).toBe('Standards');
  });

  it('starts empty when nothing was stored', () => {
    expect(read(fakeStorage())).toEqual([]);
  });

  it('drops a corrupt list rather than failing to start', () => {
    const storage = fakeStorage();
    storage.setItem('slipgauge.savedViews', 'not json');

    expect(read(storage)).toEqual([]);
  });

  it('drops an entry written by a version that stored something else', () => {
    const storage = fakeStorage();
    storage.setItem(
      'slipgauge.savedViews',
      JSON.stringify([{ id: 'a', name: 'Old', query: { text: 'a' } }]),
    );

    expect(read(storage)).toEqual([]);
  });

  it('carries on when storage refuses to write', () => {
    const refusing = {
      ...fakeStorage(),
      setItem: () => {
        throw new Error('quota');
      },
    } as Storage;

    expect(() => write(refusing, [save('Standards', view())])).not.toThrow();
  });
});
