import request from 'supertest';

import { CalibrationCertificate } from '@registry/calibration/calibration-certificate.entity';
import { CertificateStandard, StandardRole } from '@registry/traceability';
import { CalibrationFixtures } from '../support/calibration-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

describe('filing a sheet with its standards on it', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let calibrations: CalibrationFixtures;

  beforeAll(async () => {
    harness = await createTestApp();
    register = new RegisterFixtures(harness.dataSource);
    calibrations = new CalibrationFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await register.micrometer('SG-400001');
  });

  const http = () => request(harness.app.getHttpServer());

  const OUTSIDE = {
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
      certificateNumber: 'CAL-2025-0300',
      assetTag: 'SG-400001',
      performedOn: '2025-02-11',
      issuedOn: '2025-02-14',
      performedBy: 'R Okonjo',
      issuingLab: 'Slipgauge Metrology',
      points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0009, expandedUncertainty: 0.0005 }],
      standards: [OUTSIDE],
      ...overrides,
    };
  }

  async function edgesFor(certificateId: number): Promise<CertificateStandard[]> {
    return harness.dataSource.getRepository(CertificateStandard).find({
      where: { certificate: { id: certificateId } },
      relations: { standard: true },
      order: { id: 'ASC' },
    });
  }

  it('stores the outside standard as an edge of the chain', async () => {
    const filed = await http().post('/api/certificates').send(sheet()).expect(201);
    const edges = await edgesFor(filed.body.id);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.externalRef).toBe('NPL 2024/117');
    expect(edges[0]?.externalAccreditation).toBe('UKAS 0001');
    expect(edges[0]?.isInternal()).toBe(false);
  });

  it('stores an internal standard by asset tag', async () => {
    const standard = await calibrations.asStandard(await register.gaugeBlockSet('SG-400002'));
    const its = await calibrations.certificate(standard, { performedOn: '2025-01-06' });
    await calibrations.measuredOutside(its, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const filed = await http()
      .post('/api/certificates')
      .send(
        sheet({
          standards: [{ assetTag: 'SG-400002', role: StandardRole.REFERENCE }],
        }),
      )
      .expect(201);

    const edges = await edgesFor(filed.body.id);

    expect(edges[0]?.isInternal()).toBe(true);
    expect(edges[0]?.standard?.assetTag).toBe('SG-400002');
  });

  it('refuses an entry that names both an asset tag and an outside reference', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(
        sheet({
          standards: [{ ...OUTSIDE, assetTag: 'SG-400001' }],
        }),
      )
      .expect(422);

    expect(refused.body.detail).toContain('has both');
  });

  it('refuses an entry that names neither', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(sheet({ standards: [{ role: StandardRole.REFERENCE }] }))
      .expect(422);

    expect(refused.body.detail).toContain('has neither');
  });

  it('refuses to calibrate an instrument against itself', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(sheet({ standards: [{ assetTag: 'SG-400001', role: StandardRole.REFERENCE }] }))
      .expect(422);

    expect(refused.body.detail).toContain('cannot be calibrated against itself');
  });

  it('refuses a sheet with no reference standard on it', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(sheet({ standards: [] }))
      .expect(422);

    expect(refused.body.code).toBe('registry/traceability-broken');
    expect(refused.body.context.defects[0].kind).toBe('NO_REFERENCE');
  });

  it('leaves nothing behind when the chain is refused', async () => {
    await http().post('/api/certificates').send(sheet({ standards: [] })).expect(422);

    const certificates = await harness.dataSource.getRepository(CalibrationCertificate).count();

    expect(certificates).toBe(0);
  });

  it('refuses an outside standard whose window missed the day of the work', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(
        sheet({
          standards: [{ ...OUTSIDE, externalValidFrom: '2026-01-01', externalValidTo: '2026-12-31' }],
        }),
      )
      .expect(422);

    expect(refused.body.context.defects[0].kind).toBe('EXTERNAL_WINDOW_MISSED');
  });

  it('files a broken chain anyway when a written reason comes with it', async () => {
    const filed = await http()
      .post('/api/certificates')
      .send(
        sheet({
          standards: [],
          remarks: 'Interim result pending the standard coming back.',
          traceabilityOverrideReason: 'standard away at NPL, customer needs the reading now',
        }),
      )
      .expect(201);

    expect(filed.body.remarks).toContain('Interim result pending');
    expect(filed.body.remarks).toContain('Traceability override');
    expect(filed.body.remarks).toContain('standard away at NPL');
  });

  it('writes the override note on its own when there were no remarks', async () => {
    const filed = await http()
      .post('/api/certificates')
      .send(
        sheet({
          standards: [],
          traceabilityOverrideReason: 'chain to be closed when the standard returns',
        }),
      )
      .expect(201);

    expect(filed.body.remarks?.startsWith('Traceability override:')).toBe(true);
  });

  it('does not treat a blank override reason as an override', async () => {
    await http()
      .post('/api/certificates')
      .send(sheet({ standards: [], traceabilityOverrideReason: '   ' }))
      .expect(422);
  });

  it('keeps a check standard on the certificate without letting it carry the chain', async () => {
    const filed = await http()
      .post('/api/certificates')
      .send(
        sheet({
          standards: [OUTSIDE, { ...OUTSIDE, externalRef: 'NPL 2024/118', role: StandardRole.CHECK }],
        }),
      )
      .expect(201);

    const edges = await edgesFor(filed.body.id);

    expect(edges).toHaveLength(2);
    expect(edges.map((edge) => edge.role)).toEqual([StandardRole.REFERENCE, StandardRole.CHECK]);
  });

  it('reports an unknown asset tag on a standard as not found', async () => {
    const refused = await http()
      .post('/api/certificates')
      .send(sheet({ standards: [{ assetTag: 'SG-999999', role: StandardRole.REFERENCE }] }))
      .expect(404);

    expect(refused.body.code).toBe('registry/not-found');
  });
});
