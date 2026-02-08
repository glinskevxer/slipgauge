import { Role } from '@registry/security/role';

import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-21T09:00:00Z';

/** Readings on the hour, so a run of them is a run of hours. */
function sample(hour: number, temperature: number, humidity?: number) {
  return {
    takenAt: new Date(Date.UTC(2025, 10, 20, hour, 0, 0)).toISOString(),
    temperature,
    ...(humidity === undefined ? {} : { humidity }),
  };
}

describe('the room log', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await quality
      .put('/api/environment/limits')
      .send({
        locationCode: 'HARLOW-DIM',
        temperatureMin: 19,
        temperatureMax: 21,
        humidityMin: 40,
        humidityMax: 60,
        soakHours: 12,
        methodReference: 'SLP-WI-002',
      })
      .expect(200);
  });

  function upload(readings: ReturnType<typeof sample>[], loggerRef = 'LOG-1') {
    return bench
      .post('/api/environment/readings')
      .send({ locationCode: 'HARLOW-DIM', loggerRef, readings });
  }

  it('holds the room to a band and reads it back', async () => {
    const limits = await bench.get('/api/environment/limits?location=HARLOW-DIM').expect(200);

    expect(limits.body).toHaveLength(1);
    expect(limits.body[0]).toMatchObject({
      locationCode: 'HARLOW-DIM',
      temperatureMin: 19,
      temperatureMax: 21,
      soakHours: 12,
      summary: '19 to 21 C, 40 to 60 %RH',
    });
  });

  it('replaces the band rather than making a second one', async () => {
    await quality
      .put('/api/environment/limits')
      .send({ locationCode: 'HARLOW-DIM', temperatureMin: 18, temperatureMax: 22 })
      .expect(200);

    const limits = await bench.get('/api/environment/limits?location=HARLOW-DIM').expect(200);
    expect(limits.body).toHaveLength(1);
    expect(limits.body[0].temperatureMax).toBe(22);
    expect(limits.body[0].humidityMin).toBeNull();
  });

  it('keeps a discipline band beside the room wide one', async () => {
    await quality
      .put('/api/environment/limits')
      .send({
        locationCode: 'HARLOW-DIM',
        discipline: 'MASS',
        temperatureMin: 15,
        temperatureMax: 25,
      })
      .expect(200);

    const limits = await bench.get('/api/environment/limits?location=HARLOW-DIM').expect(200);
    expect(limits.body).toHaveLength(2);
  });

  it('refuses a band that reads downwards', async () => {
    await quality
      .put('/api/environment/limits')
      .send({ locationCode: 'HARLOW-DIM', temperatureMin: 25, temperatureMax: 15 })
      .expect(422);
  });

  it('refuses one end of a humidity band on its own', async () => {
    await quality
      .put('/api/environment/limits')
      .send({
        locationCode: 'HARLOW-DIM',
        temperatureMin: 19,
        temperatureMax: 21,
        humidityMin: 40,
      })
      .expect(422);
  });

  it('takes an upload and finds nothing in a room that behaved', async () => {
    const result = await upload([sample(9, 20), sample(10, 20.2), sample(11, 19.9)]).expect(201);

    expect(result.body).toMatchObject({ accepted: 3, duplicates: 0, excursionsOpened: 0 });

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body).toHaveLength(0);
  });

  it('opens one excursion for a run rather than one per reading', async () => {
    await upload([
      sample(9, 20),
      sample(10, 21.4),
      sample(11, 21.9),
      sample(12, 21.2),
      sample(13, 20.4),
    ]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);

    expect(excursions.body).toHaveLength(1);
    expect(excursions.body[0]).toMatchObject({
      locationCode: 'HARLOW-DIM',
      kind: 'TEMPERATURE_HIGH',
      severity: 'SIGNIFICANT',
      worstValue: 21.9,
      limitValue: 21,
      overshoot: 0.9,
      readings: 3,
      open: false,
      assessed: false,
      putsWorkInQuestion: true,
    });
  });

  it('drops a sample it already holds rather than refusing the upload', async () => {
    await upload([sample(9, 20), sample(10, 20)]).expect(201);

    const again = await upload([sample(10, 20), sample(11, 20)]).expect(201);
    expect(again.body).toMatchObject({ accepted: 1, duplicates: 1 });
  });

  it('joins a run that straddles two uploads into one excursion', async () => {
    await upload([sample(9, 20), sample(10, 22)]).expect(201);
    await upload([sample(11, 22), sample(12, 20)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body).toHaveLength(1);
    expect(excursions.body[0].readings).toBe(2);
  });

  it('leaves an excursion open while the room is still out', async () => {
    await upload([sample(9, 20), sample(10, 22), sample(11, 22.4)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body[0].open).toBe(true);
    expect(excursions.body[0].endedAt).toBeNull();
  });

  it('closes it once a later upload brings the room back', async () => {
    await upload([sample(9, 20), sample(10, 22)]).expect(201);
    await upload([sample(11, 20)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body).toHaveLength(1);
    expect(excursions.body[0].open).toBe(false);
  });

  it('grades a short shallow one as minor and leaves the work alone', async () => {
    await upload([sample(9, 20), sample(10, 21.05), sample(11, 20)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body[0].severity).toBe('MINOR');
    expect(excursions.body[0].putsWorkInQuestion).toBe(false);
  });

  it('catches a humidity excursion as well as a temperature one', async () => {
    await upload([sample(9, 20, 50), sample(10, 20, 75), sample(11, 20, 50)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body[0].kind).toBe('HUMIDITY_HIGH');
  });

  it('writes a finding against an excursion rather than ticking it', async () => {
    await upload([sample(9, 20), sample(10, 22), sample(11, 22), sample(12, 20)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    const assessed = await quality
      .post(`/api/environment/excursions/${excursions.body[0].id}/assessment`)
      .send({ finding: 'chiller tripped overnight, three certificates withdrawn' })
      .expect(201);

    expect(assessed.body).toMatchObject({
      assessed: true,
      assessedBy: 'suite.runner',
      finding: 'chiller tripped overnight, three certificates withdrawn',
    });
  });

  it('will not assess an excursion that has not ended', async () => {
    await upload([sample(9, 20), sample(10, 22)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    await quality
      .post(`/api/environment/excursions/${excursions.body[0].id}/assessment`)
      .send({ finding: 'still going' })
      .expect(422);
  });

  it('will not assess the same excursion twice', async () => {
    await upload([sample(9, 20), sample(10, 22), sample(11, 20)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    const id = excursions.body[0].id;

    await quality
      .post(`/api/environment/excursions/${id}/assessment`)
      .send({ finding: 'door held open' })
      .expect(201);
    await quality
      .post(`/api/environment/excursions/${id}/assessment`)
      .send({ finding: 'again' })
      .expect(409);
  });

  it('leaves an assessed excursion alone when the window is swept again', async () => {
    await upload([sample(9, 20), sample(10, 22), sample(11, 20)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    const id = excursions.body[0].id;

    await quality
      .post(`/api/environment/excursions/${id}/assessment`)
      .send({ finding: 'door held open' })
      .expect(201);

    await upload([sample(14, 20)]).expect(201);

    const after = await bench.get('/api/environment/excursions').expect(200);
    expect(after.body).toHaveLength(1);
    expect(after.body[0].id).toBe(id);
    expect(after.body[0].assessed).toBe(true);
  });

  it('lists only what nobody has looked at when asked', async () => {
    await upload([
      sample(9, 20),
      sample(10, 22),
      sample(11, 20),
      sample(14, 18),
      sample(15, 20),
    ]).expect(201);

    const all = await bench.get('/api/environment/excursions').expect(200);
    expect(all.body.length).toBeGreaterThan(1);

    await quality
      .post(`/api/environment/excursions/${all.body[0].id}/assessment`)
      .send({ finding: 'looked at' })
      .expect(201);

    const open = await bench.get('/api/environment/excursions?unassessed=true').expect(200);
    expect(open.body.length).toBe(all.body.length - 1);
  });

  it('catches a room walking across the band without ever leaving it', async () => {
    await quality
      .put('/api/environment/limits')
      .send({
        locationCode: 'HARLOW-DIM',
        temperatureMin: 19,
        temperatureMax: 21,
        driftPerHour: 0.5,
      })
      .expect(200);

    await upload([sample(9, 19.1), sample(10, 20.9), sample(11, 20.9)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body).toHaveLength(1);
    expect(excursions.body[0]).toMatchObject({
      kind: 'DRIFT',
      limitValue: 0.5,
      worstValue: 1.8,
      severity: 'MAJOR',
    });
  });

  it('says nothing about drift in a room that is not held to a rate', async () => {
    await upload([sample(9, 19.1), sample(10, 20.9)]).expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    expect(excursions.body).toHaveLength(0);
  });

  it('traces a room with the samples marked as inside or out', async () => {
    await upload([sample(9, 20), sample(10, 22), sample(11, 20)]).expect(201);

    const trace = await bench
      .get('/api/environment/rooms/HARLOW-DIM/trace')
      .query({ from: '2025-11-20T00:00:00Z', to: '2025-11-21T00:00:00Z' })
      .expect(200);

    expect(trace.body.limit.temperatureMax).toBe(21);
    expect(trace.body.samples.map((row: { outside: boolean }) => row.outside)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('does nothing at all in a room with no band set', async () => {
    const result = await bench
      .post('/api/environment/readings')
      .send({
        locationCode: 'CREWE-TOOL',
        loggerRef: 'LOG-9',
        readings: [sample(9, 40), sample(10, 45)],
      })
      .expect(201);

    expect(result.body).toMatchObject({ accepted: 2, excursionsOpened: 0 });
  });

  it('will not let the bench widen a band', async () => {
    await bench
      .put('/api/environment/limits')
      .send({ locationCode: 'HARLOW-DIM', temperatureMin: 10, temperatureMax: 30 })
      .expect(403);
  });

  it('says so plainly when the room is not on the register', async () => {
    await bench
      .post('/api/environment/readings')
      .send({ locationCode: 'NOWHERE', readings: [sample(9, 20)] })
      .expect(404);
  });
});
