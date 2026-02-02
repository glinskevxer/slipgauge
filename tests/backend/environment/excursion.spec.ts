import {
  EnvironmentLimit,
  ExcursionKind,
  ExcursionSeverity,
  Reading,
  bandWidthFor,
  breachOf,
  covers,
  findDrift,
  findExcursions,
  hoursBetween,
  limitFor,
  severityOf,
  valueFor,
} from '@registry/environment/excursion';

/** The dimensional room: twenty degrees plus or minus one, forty to sixty RH. */
const DIMENSIONAL: EnvironmentLimit = {
  temperatureMin: 19,
  temperatureMax: 21,
  humidityMin: 40,
  humidityMax: 60,
  driftPerHour: 0.5,
};

function at(hour: number, temperature: number, humidity: number | null = 50): Reading {
  const stamp = new Date(Date.UTC(2025, 10, 20, hour, 0, 0)).toISOString();

  return { takenAt: stamp, temperature, humidity };
}

function minutes(hour: number, minute: number, temperature: number): Reading {
  const stamp = new Date(Date.UTC(2025, 10, 20, hour, minute, 0)).toISOString();

  return { takenAt: stamp, temperature, humidity: 50 };
}

describe('whether one reading breaks the band', () => {
  it('says nothing when the room is where it should be', () => {
    expect(breachOf(at(9, 20), DIMENSIONAL)).toBeNull();
  });

  it('names the direction the temperature went', () => {
    expect(breachOf(at(9, 21.5), DIMENSIONAL)).toBe(ExcursionKind.TEMPERATURE_HIGH);
    expect(breachOf(at(9, 18.5), DIMENSIONAL)).toBe(ExcursionKind.TEMPERATURE_LOW);
  });

  it('treats the limits themselves as inside the band', () => {
    expect(breachOf(at(9, 21), DIMENSIONAL)).toBeNull();
    expect(breachOf(at(9, 19), DIMENSIONAL)).toBeNull();
  });

  it('reports temperature before humidity when both are out', () => {
    expect(breachOf(at(9, 25, 90), DIMENSIONAL)).toBe(ExcursionKind.TEMPERATURE_HIGH);
  });

  it('names the direction the humidity went', () => {
    expect(breachOf(at(9, 20, 70), DIMENSIONAL)).toBe(ExcursionKind.HUMIDITY_HIGH);
    expect(breachOf(at(9, 20, 30), DIMENSIONAL)).toBe(ExcursionKind.HUMIDITY_LOW);
  });

  it('ignores humidity a logger did not report', () => {
    expect(breachOf(at(9, 20, null), DIMENSIONAL)).toBeNull();
  });

  it('ignores humidity a room is not held to', () => {
    const loose: EnvironmentLimit = { ...DIMENSIONAL, humidityMin: null, humidityMax: null };

    expect(breachOf(at(9, 20, 95), loose)).toBeNull();
  });
});

describe('which number a breach is judged on', () => {
  it('reads the limit off the right end of the band', () => {
    expect(limitFor(ExcursionKind.TEMPERATURE_HIGH, DIMENSIONAL)).toBe(21);
    expect(limitFor(ExcursionKind.TEMPERATURE_LOW, DIMENSIONAL)).toBe(19);
    expect(limitFor(ExcursionKind.HUMIDITY_HIGH, DIMENSIONAL)).toBe(60);
    expect(limitFor(ExcursionKind.DRIFT, DIMENSIONAL)).toBe(0.5);
  });

  it('reads the value off the right measurement', () => {
    expect(valueFor(ExcursionKind.TEMPERATURE_HIGH, at(9, 22, 70))).toBe(22);
    expect(valueFor(ExcursionKind.HUMIDITY_HIGH, at(9, 22, 70))).toBe(70);
  });

  it('measures a band against its own width', () => {
    expect(bandWidthFor(ExcursionKind.TEMPERATURE_HIGH, DIMENSIONAL)).toBe(2);
    expect(bandWidthFor(ExcursionKind.HUMIDITY_LOW, DIMENSIONAL)).toBe(20);
  });
});

describe('how bad an excursion was', () => {
  it('is minor when it is short and shallow', () => {
    expect(severityOf(0.1, 0.5, 2)).toBe(ExcursionSeverity.MINOR);
  });

  it('goes significant on duration alone', () => {
    expect(severityOf(0.01, 3, 2)).toBe(ExcursionSeverity.SIGNIFICANT);
  });

  it('goes significant on magnitude alone', () => {
    expect(severityOf(0.4, 0.25, 2)).toBe(ExcursionSeverity.SIGNIFICANT);
  });

  it('goes major on either measure', () => {
    expect(severityOf(0.01, 9, 2)).toBe(ExcursionSeverity.MAJOR);
    expect(severityOf(1.5, 0.25, 2)).toBe(ExcursionSeverity.MAJOR);
  });

  it('does not divide by a band of nothing', () => {
    expect(severityOf(5, 0.25, 0)).toBe(ExcursionSeverity.MINOR);
  });
});

describe('finding excursions in a run of readings', () => {
  it('finds nothing in a room that behaved', () => {
    expect(findExcursions([at(9, 20), at(10, 20.2), at(11, 19.8)], DIMENSIONAL)).toHaveLength(0);
  });

  it('groups a run of breaches into one excursion rather than one each', () => {
    const found = findExcursions(
      [at(9, 20), at(10, 21.4), at(11, 21.9), at(12, 21.2), at(13, 20.5)],
      DIMENSIONAL,
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: ExcursionKind.TEMPERATURE_HIGH,
      readings: 3,
      worstValue: 21.9,
      limitValue: 21,
      hours: 3,
    });
  });

  it('ends the excursion at the reading that came back inside', () => {
    const found = findExcursions([at(9, 22), at(10, 22), at(11, 20)], DIMENSIONAL);

    expect(found[0].startedAt).toBe(at(9, 22).takenAt);
    expect(found[0].endedAt).toBe(at(11, 20).takenAt);
  });

  it('leaves an excursion open when the room was still out at the last reading', () => {
    const found = findExcursions([at(9, 20), at(10, 22), at(11, 22.5)], DIMENSIONAL);

    expect(found).toHaveLength(1);
    expect(found[0].endedAt).toBeNull();
    expect(found[0].hours).toBe(1);
  });

  it('splits when the room breaks the other end of the band', () => {
    const found = findExcursions([at(9, 22), at(10, 18), at(11, 20)], DIMENSIONAL);

    expect(found.map((row) => row.kind)).toEqual([
      ExcursionKind.TEMPERATURE_HIGH,
      ExcursionKind.TEMPERATURE_LOW,
    ]);
  });

  it('closes a run at a gap rather than stitching across it', () => {
    const found = findExcursions([at(9, 22), at(10, 22), at(16, 22), at(17, 22)], DIMENSIONAL);

    expect(found).toHaveLength(2);
    expect(found[0].hours).toBe(1);
    expect(found[1].hours).toBe(1);
  });

  it('does not close a run at a gap the logger interval explains', () => {
    const found = findExcursions([at(9, 22), at(11, 22)], DIMENSIONAL, 4);

    expect(found).toHaveLength(1);
    expect(found[0].readings).toBe(2);
  });

  it('keeps the worst reading rather than the last one', () => {
    const found = findExcursions([at(9, 23.5), at(10, 21.2), at(11, 20)], DIMENSIONAL);

    expect(found[0].worstValue).toBe(23.5);
    expect(found[0].severity).toBe(ExcursionSeverity.MAJOR);
  });

  it('grades an eight hour drift as major even a tenth of a degree out', () => {
    const readings = [at(8, 20)];
    for (let hour = 9; hour <= 18; hour += 1) {
      readings.push(at(hour, 21.1));
    }

    const found = findExcursions(readings, DIMENSIONAL, 2);
    expect(found[0].severity).toBe(ExcursionSeverity.MAJOR);
  });

  it('finds a humidity excursion beside a temperature one', () => {
    const found = findExcursions([at(9, 20, 75), at(10, 20, 50), at(11, 22, 50)], DIMENSIONAL);

    expect(found.map((row) => row.kind)).toEqual([
      ExcursionKind.HUMIDITY_HIGH,
      ExcursionKind.TEMPERATURE_HIGH,
    ]);
  });

  it('finds nothing at all in an empty stream', () => {
    expect(findExcursions([], DIMENSIONAL)).toHaveLength(0);
  });
});

describe('finding drift inside the band', () => {
  it('finds nothing when the room moves slowly', () => {
    expect(findDrift([at(9, 19.2), at(10, 19.6), at(11, 20)], DIMENSIONAL)).toHaveLength(0);
  });

  it('catches a room walking across the band in twenty minutes', () => {
    const found = findDrift([minutes(9, 0, 19.1), minutes(9, 20, 20.9)], DIMENSIONAL);

    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe(ExcursionKind.DRIFT);
    expect(found[0].worstValue).toBeCloseTo(5.4, 1);
  });

  it('says nothing when the room is not held to a rate at all', () => {
    const loose: EnvironmentLimit = { ...DIMENSIONAL, driftPerHour: null };

    expect(findDrift([minutes(9, 0, 19.1), minutes(9, 20, 20.9)], loose)).toHaveLength(0);
  });

  it('ignores two readings with the same stamp rather than dividing by nothing', () => {
    expect(findDrift([at(9, 19), at(9, 21)], DIMENSIONAL)).toHaveLength(0);
  });

  it('needs two readings before it can say anything', () => {
    expect(findDrift([at(9, 19)], DIMENSIONAL)).toHaveLength(0);
  });
});

describe('whether an excursion covers a moment', () => {
  const closed = findExcursions([at(9, 22), at(10, 22), at(11, 20)], DIMENSIONAL)[0];
  const open = findExcursions([at(9, 22), at(10, 22)], DIMENSIONAL)[0];

  it('covers the whole window including both ends', () => {
    expect(covers(closed, at(9, 0).takenAt)).toBe(true);
    expect(covers(closed, at(10, 0).takenAt)).toBe(true);
    expect(covers(closed, at(11, 0).takenAt)).toBe(true);
  });

  it('does not cover before it started or after it ended', () => {
    expect(covers(closed, at(8, 0).takenAt)).toBe(false);
    expect(covers(closed, at(12, 0).takenAt)).toBe(false);
  });

  it('covers everything after the start while it is still open', () => {
    expect(covers(open, at(23, 0).takenAt)).toBe(true);
  });
});

describe('counting hours', () => {
  it('counts fractions', () => {
    expect(hoursBetween(minutes(9, 0, 20).takenAt, minutes(9, 30, 20).takenAt)).toBe(0.5);
  });

  it('goes negative backwards', () => {
    expect(hoursBetween(at(11, 20).takenAt, at(9, 20).takenAt)).toBe(-2);
  });
});
