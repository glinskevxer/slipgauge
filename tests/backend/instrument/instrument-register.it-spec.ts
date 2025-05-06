import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentStatus } from '@registry/instrument/instrument.enums';
import { StorageLocation } from '@registry/instrument/storage-location.entity';
import { Role } from '@registry/security/role';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

describe('the instrument register', () => {
  let harness: TestApp;
  let fixtures: RegisterFixtures;

  beforeAll(async () => {
    harness = await createTestApp();
    fixtures = new RegisterFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  const MICROMETER = {
    classCode: 'MIC-EXT',
    manufacturer: 'Mitutoyo',
    model: '103-137',
    serialNumber: '7241188',
    unit: 'mm',
    rangeLow: 0,
    rangeHigh: 25,
    resolution: 0.001,
    locationCode: 'HARLOW-DIM',
    custodian: 'R Okonjo',
    referenceStandard: false,
    acquiredOn: '2024-06-03',
  };

  it('loads every class the laboratory runs from the migrations', async () => {
    const response = await http().get('/api/reference/classes').expect(200);

    expect(response.body).toHaveLength(30);
    expect(response.body).toContainEqual(
      expect.objectContaining({
        code: 'GB-REF',
        discipline: 'DIMENSIONAL',
        criticality: 'CRITICAL',
        maxIntervalDays: 1825,
      }),
    );
  });

  it('nests rooms inside their laboratory', async () => {
    const quarantine = await harness.dataSource
      .getRepository(StorageLocation)
      .findOneOrFail({ where: { code: 'HARLOW-QUAR' }, relations: { parent: { parent: true } } });

    expect(quarantine.pathCodes()).toEqual(['HARLOW', 'HARLOW-STORE', 'HARLOW-QUAR']);
  });

  it('allocates the next tag in sequence when an instrument is booked in', async () => {
    const response = await http().post('/api/instruments').send(MICROMETER).expect(201);

    expect(response.body).toMatchObject({
      assetTag: 'SG-000001',
      classCode: 'MIC-EXT',
      status: 'IN_SERVICE',
      locationPath: ['HARLOW', 'HARLOW-LAB', 'HARLOW-DIM'],
    });
    expect(response.headers['location']).toBe(`/api/instruments/${response.body.id}`);
  });

  it('keeps counting from the highest tag already issued', async () => {
    await http().post('/api/instruments').send(MICROMETER).expect(201);
    const second = await http()
      .post('/api/instruments')
      .send({ ...MICROMETER, serialNumber: '7241189' })
      .expect(201);

    expect(second.body.assetTag).toBe('SG-000002');
  });

  it('refuses the same serial from the same maker twice', async () => {
    await http().post('/api/instruments').send(MICROMETER).expect(201);

    const refused = await http().post('/api/instruments').send(MICROMETER).expect(409);
    expect(refused.body.code).toBe('registry/already-exists');
  });

  it('reports an unknown class as a problem document', async () => {
    const refused = await http()
      .post('/api/instruments')
      .send({ ...MICROMETER, classCode: 'NOT-A-CLASS' })
      .expect(404);

    expect(refused.body).toMatchObject({
      code: 'registry/not-found',
      context: { resource: 'instrument class' },
    });
  });

  it('refuses a body carrying a field the request does not define', async () => {
    const refused = await http()
      .post('/api/instruments')
      .send({ ...MICROMETER, assetTag: 'SG-999999' })
      .expect(400);

    expect(refused.body.code).toBe('registry/validation-failed');
  });

  it('refuses a range the wrong way round before it reaches the database', async () => {
    const refused = await http()
      .post('/api/instruments')
      .send({ ...MICROMETER, rangeLow: 25, rangeHigh: 0 })
      .expect(422);

    expect(refused.body).toMatchObject({
      code: 'registry/rule-violation',
      detail: 'range low must sit below range high',
    });
  });

  it('filters by discipline and pages the result', async () => {
    for (let i = 1; i <= 7; i++) {
      await fixtures.save(
        `SG-90000${i}`, 'BAL-ANA', 'Sartorius', 'Cubis II', 'g', 0, 220, 0.0001, 'HARLOW-MASS',
      );
    }
    await fixtures.micrometer('SG-800001');

    const response = await http()
      .get('/api/instruments')
      .query({ disciplines: 'MASS', size: 5, sort: '-assetTag' })
      .expect(200);

    expect(response.body.items).toHaveLength(5);
    expect(response.body.totalItems).toBe(7);
    expect(response.body.totalPages).toBe(2);
    expect(response.body.items[0].assetTag).toBe('SG-900007');
    expect(response.body.items[0].discipline).toBe('MASS');
  });

  it('keeps retired instruments out of the default view', async () => {
    const gone = await fixtures.micrometer('SG-800002');
    gone.retire('2024-11-30');
    await harness.dataSource.getRepository(Instrument).save(gone);

    const hidden = await http().get('/api/instruments').query({ text: '800002' }).expect(200);
    expect(hidden.body.totalItems).toBe(0);

    const shown = await http()
      .get('/api/instruments')
      .query({ text: '800002', includeRetired: 'true' })
      .expect(200);
    expect(shown.body.totalItems).toBe(1);
  });

  it('searches the tag, the maker, the model and the serial together', async () => {
    await fixtures.micrometer('SG-800003');

    for (const term of ['800003', 'mitutoyo', '103-137', 'SN-800003']) {
      const response = await http().get('/api/instruments').query({ text: term }).expect(200);
      expect(response.body.totalItems).toBe(1);
    }
  });

  it('refuses a sort by a column nobody allowed', async () => {
    const refused = await http()
      .get('/api/instruments')
      .query({ sort: 'instrumentClass.criticality' })
      .expect(400);

    expect(refused.body.code).toBe('registry/validation-failed');
    expect(refused.body.detail).toContain('allowed columns are');
  });

  it('moves an instrument between the states that allow it', async () => {
    const instrument = await fixtures.micrometer('SG-800004');

    const quarantined = await http()
      .post(`/api/instruments/${instrument.id}/status`)
      .query({ target: InstrumentStatus.QUARANTINED })
      .expect(201);
    expect(quarantined.body.status).toBe('QUARANTINED');

    await http()
      .post(`/api/instruments/${instrument.id}/status`)
      .query({ target: InstrumentStatus.IN_SERVICE })
      .expect(409);
  });

  it('finds an instrument by the tag printed on it', async () => {
    await fixtures.micrometer('SG-800005');

    const response = await http().get('/api/instruments/by-tag/SG-800005').expect(200);
    expect(response.body.manufacturer).toBe('Mitutoyo');

    await http().get('/api/instruments/by-tag/SG-999999').expect(404);
  });
});
