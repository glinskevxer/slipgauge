import { CompetenceLevel } from '@registry/competence/competence-level';
import { Instrument } from '@registry/instrument/instrument.entity';
import { Discipline } from '@registry/instrument/instrument.enums';
import { Role } from '@registry/security/role';

import { CompetenceFixtures } from '../support/competence-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2026-01-06T09:00:00Z';

const OUTSIDE_STANDARD = {
  externalRef: 'NPL 2024/117',
  externalLab: 'National Physical Laboratory',
  externalCertificateNumber: 'NPL-2024-117',
  externalAccreditation: 'UKAS 0001',
  externalValidFrom: '2024-11-01',
  externalValidTo: '2026-10-31',
  role: 'REFERENCE',
};

describe('the management review pack', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;
  let register: RegisterFixtures;
  let authorisations: CompetenceFixtures;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER, Role.METROLOGIST));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    register = new RegisterFixtures(harness.dataSource);
    authorisations = new CompetenceFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  function pack(from = '2025-01-01', to = '2025-12-31') {
    return quality.get(`/api/management-review?from=${from}&to=${to}`);
  }

  it('comes back with every input the standard lists', async () => {
    const body = (await pack().expect(200)).body;

    expect(body.period).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(body.preparedOn).toBe('2026-01-06');
    expect(Object.keys(body).sort()).toEqual([
      'capa',
      'environment',
      'period',
      'preparedOn',
      'proficiency',
      'resources',
      'scope',
      'talkingPoints',
      'workload',
    ]);
  });

  it('counts the register as it stands rather than as it was', async () => {
    await register.micrometer('SG-0001');
    const standard = await register.gaugeBlockSet('SG-9001');
    standard.nextDueOn = '2025-06-01';
    await harness.dataSource.getRepository(Instrument).save(standard);

    const body = (await pack().expect(200)).body;

    expect(body.resources.instrumentsInService).toBe(2);
    expect(body.resources.referenceStandards).toBe(1);
    expect(body.resources.overdue).toBe(1);
  });

  it('names a discipline nobody can approve in', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.AUTHORISED);

    const body = (await pack().expect(200)).body;

    expect(body.resources.peopleAuthorised).toBe(1);
    expect(body.resources.disciplinesWithoutAnApprover).toEqual(['DIMENSIONAL']);
    expect(body.talkingPoints.join(' ')).toContain('Nobody can approve work in dimensional');
  });

  it('says nothing about approvers once somebody holds the level', async () => {
    await authorisations.grant('a.pereira', Discipline.DIMENSIONAL, CompetenceLevel.APPROVER);

    const body = (await pack().expect(200)).body;
    expect(body.resources.disciplinesWithoutAnApprover).toHaveLength(0);
  });

  it('counts what was raised and closed inside the period', async () => {
    await bench
      .post('/api/nonconformities')
      .send({
        source: 'COMPLAINT',
        severity: 'LOW',
        title: 'a small thing',
        detail: 'raised for the pack',
      })
      .expect(201);

    const thisYear = (await pack('2026-01-01', '2026-12-31').expect(200)).body;
    expect(thisYear.capa.raised).toBe(1);
    expect(thisYear.capa.openAtEnd).toBe(1);
    expect(thisYear.capa.bySource).toEqual({ COMPLAINT: 1 });

    const lastYear = (await pack().expect(200)).body;
    expect(lastYear.capa.raised).toBe(0);
    expect(lastYear.capa.openAtEnd).toBe(1);
  });

  it('counts the certificates and what was found on them', async () => {
    await authorisations.grant('r.okonjo', Discipline.DIMENSIONAL, CompetenceLevel.AUTHORISED);
    await register.micrometer('SG-0001');

    await quality
      .post('/api/certificates')
      .send({
        certificateNumber: 'CAL-5001',
        assetTag: 'SG-0001',
        performedOn: '2025-06-02',
        issuedOn: '2025-06-03',
        performedBy: 'r.okonjo',
        issuingLab: 'Slipgauge Metrology',
        points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0091, expandedUncertainty: 0.0005 }],
        standards: [OUTSIDE_STANDARD],
      })
      .expect(201);

    const body = (await pack().expect(200)).body;

    expect(body.workload.certificatesIssued).toBe(1);
    expect(body.workload.outOfToleranceFound).toBe(1);
    expect(body.talkingPoints.join(' ')).not.toContain('withdrawn');
  });

  it('says so when the laboratory worked in a discipline the schedule does not cover', async () => {
    await authorisations.grant('r.okonjo', Discipline.TORQUE, CompetenceLevel.AUTHORISED);
    await register.save('SG-0100', 'TW-CLICK', 'Norbar', 'Pro 400', 'Nm', 0, 400, 0.1);

    await quality
      .post('/api/certificates')
      .send({
        certificateNumber: 'CAL-5002',
        assetTag: 'SG-0100',
        performedOn: '2025-06-02',
        issuedOn: '2025-06-03',
        performedBy: 'r.okonjo',
        issuingLab: 'Slipgauge Metrology',
        points: [{ sequenceNo: 1, nominal: 200, asFound: 200.1, expandedUncertainty: 0.4 }],
        standards: [OUTSIDE_STANDARD],
      })
      .expect(201);

    const body = (await pack().expect(200)).body;

    expect(body.scope.workedButUnaccredited).toContain('TORQUE');
    expect(body.talkingPoints.join(' ')).toContain('nothing on the schedule of accreditation');
  });

  it('raises nothing when the register is quiet', async () => {
    const body = (await pack().expect(200)).body;

    expect(body.talkingPoints).toEqual([
      'No proficiency round was scored in the period.',
    ]);
  });

  it('defaults to the last twelve months', async () => {
    const body = (await quality.get('/api/management-review').expect(200)).body;

    expect(body.period.to).toBe('2026-01-06');
    expect(body.period.from).toBe('2025-01-06');
  });

  it('refuses a period that ends before it starts', async () => {
    await quality
      .get('/api/management-review?from=2025-12-31&to=2025-01-01')
      .expect(400);
  });

  it('refuses a date that is not a date', async () => {
    await quality.get('/api/management-review?from=January&to=2025-12-31').expect(400);
  });

  it('will not let the bench read it', async () => {
    await bench.get('/api/management-review').expect(403);
  });
});
