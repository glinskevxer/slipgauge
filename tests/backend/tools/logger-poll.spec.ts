import { roomsFrom, settingsFrom, toSamples } from '@registry/tools/logger-poll';

describe('reading the settings', () => {
  const complete = {
    REGISTRY_API: 'http://registry:8080/api',
    REGISTRY_LOGGER_HOST: 'http://loggers.lab',
    REGISTRY_LOGGER_TOKEN: 'a-token',
  };

  it('takes a complete set', () => {
    expect(settingsFrom(complete).api).toBe('http://registry:8080/api');
  });

  it('refuses rather than guessing at a missing one', () => {
    for (const key of Object.keys(complete)) {
      const partial = { ...complete, [key]: undefined };

      expect(() => settingsFrom(partial)).toThrow(/have to be set/);
    }
  });

  it('takes no rooms at all as no rooms rather than an error', () => {
    expect(settingsFrom(complete).rooms).toHaveLength(0);
  });
});

describe('the room list', () => {
  it('reads a pair per room', () => {
    expect(roomsFrom('HARLOW-DIM=TINYTAG-4471,CREWE-TOOL=TINYTAG-4472')).toEqual([
      { locationCode: 'HARLOW-DIM', loggerRef: 'TINYTAG-4471' },
      { locationCode: 'CREWE-TOOL', loggerRef: 'TINYTAG-4472' },
    ]);
  });

  it('tolerates the spaces somebody puts in an environment file', () => {
    expect(roomsFrom(' HARLOW-DIM = TINYTAG-4471 , ')).toEqual([
      { locationCode: 'HARLOW-DIM', loggerRef: 'TINYTAG-4471' },
    ]);
  });

  it('refuses something that is not a pair', () => {
    expect(() => roomsFrom('HARLOW-DIM')).toThrow(/not a room=logger pair/);
  });

  it('reads an empty setting as no rooms', () => {
    expect(roomsFrom('')).toHaveLength(0);
    expect(roomsFrom('   ')).toHaveLength(0);
  });
});

describe('turning what a logger says into what the registry takes', () => {
  it('reads either spelling of the fields', () => {
    const samples = toSamples([
      { timestamp: '2025-11-20T09:00:00Z', temperature: 20.1, humidity: 48 },
      { takenAt: '2025-11-20T10:00:00Z', temp: 20.4, rh: 49 },
    ]);

    expect(samples).toEqual([
      { takenAt: '2025-11-20T09:00:00.000Z', temperature: 20.1, humidity: 48 },
      { takenAt: '2025-11-20T10:00:00.000Z', temperature: 20.4, humidity: 49 },
    ]);
  });

  it('drops a repeated sample the logger sent twice', () => {
    const samples = toSamples([
      { timestamp: '2025-11-20T09:00:00Z', temperature: 20.1 },
      { timestamp: '2025-11-20T09:00:00Z', temperature: 20.1 },
    ]);

    expect(samples).toHaveLength(1);
  });

  it('drops a row with no usable temperature rather than sending a NaN', () => {
    const samples = toSamples([
      { timestamp: '2025-11-20T09:00:00Z', temperature: 'warm' },
      { timestamp: '2025-11-20T10:00:00Z' },
      { temperature: 20 },
    ]);

    expect(samples).toHaveLength(0);
  });

  it('leaves humidity out when the logger does not report it', () => {
    expect(toSamples([{ timestamp: '2025-11-20T09:00:00Z', temperature: 20 }])[0]).toEqual({
      takenAt: '2025-11-20T09:00:00.000Z',
      temperature: 20,
    });
  });

  it('sorts what came back out of order', () => {
    const samples = toSamples([
      { timestamp: '2025-11-20T11:00:00Z', temperature: 20 },
      { timestamp: '2025-11-20T09:00:00Z', temperature: 20 },
    ]);

    expect(samples.map((row) => row.takenAt)).toEqual([
      '2025-11-20T09:00:00.000Z',
      '2025-11-20T11:00:00.000Z',
    ]);
  });

  it('reads anything that is not a list as nothing', () => {
    expect(toSamples(null)).toHaveLength(0);
    expect(toSamples({ readings: [] })).toHaveLength(0);
  });
});
