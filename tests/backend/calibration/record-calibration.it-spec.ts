import { AcceptancePolicy, Verdict } from '@registry/calibration/conformity';
import { StandardRole } from '@registry/traceability';
import { Role } from '@registry/security/role';
import { RegisterFixtures } from '../support/fixtures';
import { CompetenceFixtures } from '../support/competence-fixtures';
import { TestApp, createTestApp } from '../support/test-app';

describe('filing a calibration sheet', () => {
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
    const authorisations = new CompetenceFixtures(harness.dataSource);
    await authorisations.authoriseApprover('R Okonjo');
    await authorisations.authoriseApprover('D Ferreira');
    await fixtures.micrometer('SG-200001');
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  /** Every sheet needs a reference standard, so the default one is out here. */
  const OUTSIDE_STANDARD = {
    externalRef: 'NPL 2024/117',
    externalLab: 'National Physical Laboratory',
    externalCertificateNumber: 'NPL-2024-117',
    externalAccreditation: 'UKAS 0001',
    externalValidFrom: '2024-11-01',
    externalValidTo: '2025-10-31',
    role: StandardRole.REFERENCE,
  };

  function sheet(overrides: Record<string, unknown> = {}) {
    return {
      certificateNumber: 'CAL-2025-0100',
      assetTag: 'SG-200001',
      performedOn: '2025-02-11',
      issuedOn: '2025-02-14',
      performedBy: 'R Okonjo',
      issuingLab: 'Slipgauge Metrology',
      points: [
        { sequenceNo: 1, nominal: 5, asFound: 5.0011, expandedUncertainty: 0.0005 },
        { sequenceNo: 2, nominal: 20, asFound: 20.0009, expandedUncertainty: 0.0005 },
      ],
      standards: [OUTSIDE_STANDARD],
      ...overrides,
    };
  }

  it('works the tolerance limits out from the profile rather than the sheet', async () => {
    const filed = await http().post('/api/certificates').send(sheet()).expect(201);

    expect(filed.body.points).toHaveLength(2);
    expect(filed.body.points[0].toleranceLow).toBeCloseTo(4.996, 9);
    expect(filed.body.points[0].toleranceHigh).toBeCloseTo(5.004, 9);
    expect(filed.body.asFoundVerdict).toBe(Verdict.PASS);
    expect(filed.body.live).toBe(true);
  });

  it('refuses a sheet that tries to send its own tolerance', async () => {
    await http()
      .post('/api/certificates')
      .send(
        sheet({
          points: [
            {
              sequenceNo: 1,
              nominal: 5,
              asFound: 5.0011,
              expandedUncertainty: 0.0005,
              toleranceLow: 0,
              toleranceHigh: 100,
            },
          ],
        }),
      )
      .expect(400);
  });

  it('reads the as found value across into as left when nothing was adjusted', async () => {
    const filed = await http().post('/api/certificates').send(sheet()).expect(201);

    expect(filed.body.points[0].asLeft).toBeCloseTo(5.0011, 9);
    expect(filed.body.points[0].asLeftVerdict).toBe(Verdict.PASS);
    expect(filed.body.points[0].asFoundError).toBeCloseTo(0.0011, 9);
  });

  it('keeps the two readings apart when the bench did adjust the instrument', async () => {
    const filed = await http()
      .post('/api/certificates')
      .send(
        sheet({
          adjusted: true,
          points: [
            {
              sequenceNo: 1,
              nominal: 20,
              asFound: 20.0051,
              asLeft: 20.0002,
              expandedUncertainty: 0.0005,
            },
          ],
        }),
      )
      .expect(201);

    expect(filed.body.asFoundVerdict).toBe(Verdict.OUT_OF_TOLERANCE);
    expect(filed.body.asLeftVerdict).toBe(Verdict.PASS);
    expect(filed.body.adjusted).toBe(true);
  });

  it('takes the worst point for the certificate verdict', async () => {
    const filed = await http()
      .post('/api/certificates')
      .send(
        sheet({
          acceptancePolicy: AcceptancePolicy.STRINGENT,
          points: [
            { sequenceNo: 1, nominal: 5, asFound: 5.0001, expandedUncertainty: 0.0005 },
            { sequenceNo: 2, nominal: 20, asFound: 20.0037, expandedUncertainty: 0.0005 },
          ],
        }),
      )
      .expect(201);

    expect(filed.body.points[0].asFoundVerdict).toBe(Verdict.PASS);
    expect(filed.body.points[1].asFoundVerdict).toBe(Verdict.MARGINAL);
    expect(filed.body.asFoundVerdict).toBe(Verdict.MARGINAL);
  });

  it('refuses the same certificate number twice from the same laboratory', async () => {
    await http().post('/api/certificates').send(sheet()).expect(201);

    const refused = await http().post('/api/certificates').send(sheet()).expect(409);

    expect(refused.body.code).toBe('registry/already-exists');
  });

  it('accepts the same number from a different laboratory', async () => {
    await http().post('/api/certificates').send(sheet()).expect(201);
    await http()
      .post('/api/certificates')
      .send(sheet({ issuingLab: 'Outside Calibration Ltd', externalLab: true }))
      .expect(201);
  });

  it('refuses a nominal the instrument cannot reach', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(
        sheet({
          points: [{ sequenceNo: 1, nominal: 40, asFound: 40.001, expandedUncertainty: 0.0005 }],
        }),
      )
      .expect(422);

    expect(refused.body.detail).toContain('sits outside the range');
  });

  it('refuses the same sequence number twice on one sheet', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(
        sheet({
          points: [
            { sequenceNo: 1, nominal: 5, asFound: 5.001, expandedUncertainty: 0.0005 },
            { sequenceNo: 1, nominal: 20, asFound: 20.001, expandedUncertainty: 0.0005 },
          ],
        }),
      )
      .expect(422);

    expect(refused.body.detail).toContain('appears more than once');
  });

  it('refuses a calibration dated before the instrument was acquired', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(sheet({ performedOn: '2019-01-04', issuedOn: '2019-01-06' }))
      .expect(422);

    expect(refused.body.detail).toContain('before the instrument was acquired');
  });

  it('refuses a calibration dated in the future', async () => {
    await http()
      .post('/api/certificates')
      .send(sheet({ performedOn: '2099-01-04', issuedOn: '2099-01-06' }))
      .expect(422);
  });

  it('refuses a certificate issued before the work was done', async () => {
    await http()
      .post('/api/certificates')
      .send(sheet({ performedOn: '2025-02-14', issuedOn: '2025-02-11' }))
      .expect(422);
  });

  it('refuses an empty sheet', async () => {
    await http().post('/api/certificates').send(sheet({ points: [] })).expect(400);
  });

  it('reports an unknown asset tag as not found', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(sheet({ assetTag: 'SG-999999' }))
      .expect(404);

    expect(refused.body.code).toBe('registry/not-found');
  });

  it('will not let the technician who did the work approve it', async () => {
    const filed = await http().post('/api/certificates').send(sheet()).expect(201);

    await http()
      .post(`/api/certificates/${filed.body.id}/approval`)
      .query({ approver: 'R Okonjo' })
      .expect(422);

    const approved = await http()
      .post(`/api/certificates/${filed.body.id}/approval`)
      .query({ approver: 'D Ferreira' })
      .expect(201);

    expect(approved.body.approvedBy).toBe('D Ferreira');
  });

  it('drops a withdrawn certificate out of the history', async () => {
    const filed = await http().post('/api/certificates').send(sheet()).expect(201);

    let history = await http().get('/api/instruments/SG-200001/certificates').expect(200);
    expect(history.body).toHaveLength(1);

    await http()
      .post(`/api/certificates/${filed.body.id}/withdrawal`)
      .query({ reason: 'filed against the wrong asset' })
      .expect(201);

    history = await http().get('/api/instruments/SG-200001/certificates').expect(200);
    expect(history.body).toHaveLength(0);

    const withdrawn = await http().get(`/api/certificates/${filed.body.id}`).expect(200);
    expect(withdrawn.body.live).toBe(false);
    expect(withdrawn.body.withdrawnReason).toBe('filed against the wrong asset');
  });

  it('refuses a withdrawal with no reason given', async () => {
    const filed = await http().post('/api/certificates').send(sheet()).expect(201);

    await http().post(`/api/certificates/${filed.body.id}/withdrawal`).expect(400);
  });

  it('orders the history newest visit first', async () => {
    await http().post('/api/certificates').send(sheet()).expect(201);
    await http()
      .post('/api/certificates')
      .send(
        sheet({
          certificateNumber: 'CAL-2025-0180',
          performedOn: '2025-08-04',
          issuedOn: '2025-08-06',
        }),
      )
      .expect(201);

    const history = await http().get('/api/instruments/SG-200001/certificates').expect(200);

    expect(history.body.map((each: { certificateNumber: string }) => each.certificateNumber)).toEqual(
      ['CAL-2025-0180', 'CAL-2025-0100'],
    );
  });
});
