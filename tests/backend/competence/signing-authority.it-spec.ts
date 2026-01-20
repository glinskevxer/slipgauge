import { CompetenceLevel } from '@registry/competence/competence-level';
import { Instrument } from '@registry/instrument/instrument.entity';
import { Discipline } from '@registry/instrument/instrument.enums';
import { Role } from '@registry/security/role';

import { CompetenceFixtures } from '../support/competence-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

/** A traceable outside standard, so the chain check is never what refuses. */
const OUTSIDE_STANDARD = {
  externalRef: 'NPL 2024/117',
  externalLab: 'National Physical Laboratory',
  externalCertificateNumber: 'NPL-2024-117',
  externalAccreditation: 'UKAS 0001',
  externalValidFrom: '2024-11-01',
  externalValidTo: '2026-10-31',
  role: 'REFERENCE',
};

/**
 * The rule the authorisation register exists for: a sheet is refused when the
 * person who did the work was not authorised to do it on the day they did it.
 */
describe('who may file and who may sign', () => {
  let harness: TestApp;
  let http: ReturnType<TestApp['api']>;
  let register: RegisterFixtures;
  let authorisations: CompetenceFixtures;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    http = harness.api(harness.tokenFor(Role.QUALITY_MANAGER, Role.METROLOGIST));
    register = new RegisterFixtures(harness.dataSource);
    authorisations = new CompetenceFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();

    const standard = await register.gaugeBlockSet('SG-9001');
    standard.nextDueOn = '2026-06-30';
    await harness.dataSource.getRepository(Instrument).save(standard);
    await register.micrometer('SG-0001');
  });

  function sheet(overrides: Record<string, unknown> = {}) {
    return {
      certificateNumber: 'CAL-7001',
      assetTag: 'SG-0001',
      performedOn: '2025-11-18',
      issuedOn: '2025-11-19',
      performedBy: 'r.okonjo',
      issuingLab: 'Slipgauge Metrology',
      points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0004, expandedUncertainty: 0.0005 }],
      standards: [OUTSIDE_STANDARD],
      ...overrides,
    };
  }

  it('refuses a sheet from somebody who holds nothing', async () => {
    const refused = await http.post('/api/certificates').send(sheet()).expect(422);

    expect(refused.body.detail).toBe('r.okonjo holds nothing for dimensional');
    expect(refused.body.context.reason).toBe('NOTHING_HELD');
  });

  it('files it once the authorisation is granted', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.AUTHORISED);

    const filed = await http.post('/api/certificates').send(sheet()).expect(201);
    expect(filed.body.certificateNumber).toBe('CAL-7001');
  });

  it('refuses a sheet dated before the authorisation started', async () => {
    await authorisations.grant(
      'r.okonjo',
      Discipline.DIMENSIONAL,
      CompetenceLevel.AUTHORISED,
      '2025-11-19',
    );

    const refused = await http.post('/api/certificates').send(sheet()).expect(422);
    expect(refused.body.detail).toContain('not authorised for dimensional until 2025-11-19');
  });

  it('refuses a sheet dated after the authorisation ran out', async () => {
    await authorisations.grant(
      'r.okonjo',
      Discipline.DIMENSIONAL,
      CompetenceLevel.AUTHORISED,
      '2025-01-01',
      '2025-10-31',
    );

    const refused = await http.post('/api/certificates').send(sheet()).expect(422);
    expect(refused.body.detail).toContain('ran out on 2025-10-31');
  });

  it('refuses a trainee, and names the level they would need', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.TRAINEE);

    const refused = await http.post('/api/certificates').send(sheet()).expect(422);
    expect(refused.body.detail).toBe('r.okonjo is trainee and this needs authorised');
  });

  it('refuses a sheet that measured past the top of a bounded authorisation', async () => {
    const bounded = await authorisations.grant(
      'r.okonjo',
      Discipline.DIMENSIONAL,
      CompetenceLevel.AUTHORISED,
    );
    await harness.dataSource.query(
      'update competence set range_low = 0, range_high = 10 where id = $1',
      [bounded.id],
    );

    const refused = await http.post('/api/certificates').send(sheet()).expect(422);
    expect(refused.body.detail).toContain('authorised from 0 to 10, this reaches 20');
  });

  it('does not ask the register about a certificate filed by another laboratory', async () => {
    const filed = await http
      .post('/api/certificates')
      .send(
        sheet({
          externalLab: true,
          issuingLab: 'National Physical Laboratory',
          performedBy: 'somebody we do not employ',
        }),
      )
      .expect(201);

    expect(filed.body.externalLab).toBe(true);
  });

  it('refuses an approver who is only authorised to perform', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.AUTHORISED);
    await authorisations.grant('a.pereira', Discipline.DIMENSIONAL, CompetenceLevel.AUTHORISED);

    const filed = await http.post('/api/certificates').send(sheet()).expect(201);

    const refused = await http
      .post(`/api/certificates/${filed.body.id}/approval`)
      .query({ approver: 'a.pereira' })
      .expect(422);

    expect(refused.body.detail).toBe('a.pereira is authorised and this needs approver');
  });

  it('lets an approver sign it off', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.AUTHORISED);
    await authorisations.grant('a.pereira', Discipline.DIMENSIONAL, CompetenceLevel.APPROVER);

    const filed = await http.post('/api/certificates').send(sheet()).expect(201);
    const approved = await http
      .post(`/api/certificates/${filed.body.id}/approval`)
      .query({ approver: 'a.pereira' })
      .expect(201);

    expect(approved.body.approvedBy).toBe('a.pereira');
  });

  it('still refuses an approver who did the work, even holding the level', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.APPROVER);

    const filed = await http.post('/api/certificates').send(sheet()).expect(201);

    await http
      .post(`/api/certificates/${filed.body.id}/approval`)
      .query({ approver: 'r.okonjo' })
      .expect(422);
  });

  it('refuses an approver whose authorisation is in another discipline', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.AUTHORISED);
    await authorisations.grant('a.pereira', Discipline.TORQUE, CompetenceLevel.APPROVER);

    const filed = await http.post('/api/certificates').send(sheet()).expect(201);

    const refused = await http
      .post(`/api/certificates/${filed.body.id}/approval`)
      .query({ approver: 'a.pereira' })
      .expect(422);

    expect(refused.body.detail).toBe('a.pereira holds nothing for dimensional');
  });
});
