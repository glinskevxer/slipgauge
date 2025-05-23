import request from 'supertest';

import { Verdict } from '@registry/calibration/conformity';
import { RegistryMetrics } from '@registry/observability';
import { Role } from '@registry/security/role';
import { StandardRole } from '@registry/traceability';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';

describe('the counters the laboratory actually watches', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let metrics: RegistryMetrics;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
    metrics = harness.app.get(RegistryMetrics);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    metrics.reset();
    await register.micrometer('SG-950001');
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));
  const scrape = async (): Promise<string> =>
    (await request(harness.app.getHttpServer()).get('/metrics').expect(200)).text;

  const OUTSIDE = {
    externalRef: 'NPL 2024/117',
    externalLab: 'National Physical Laboratory',
    externalValidFrom: '2020-01-01',
    externalValidTo: '2029-12-31',
    role: StandardRole.REFERENCE,
  };

  function sheet(overrides: Record<string, unknown> = {}) {
    return {
      certificateNumber: 'CAL-METRIC-1',
      assetTag: 'SG-950001',
      performedOn: '2025-02-11',
      issuedOn: '2025-02-11',
      performedBy: 'R Okonjo',
      issuingLab: 'Slipgauge Metrology',
      points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0004, expandedUncertainty: 0.0005 }],
      standards: [OUTSIDE],
      ...overrides,
    };
  }

  it('counts a certificate under the verdict it came back with', async () => {
    await http().post('/api/certificates').send(sheet()).expect(201);

    expect(await scrape()).toContain(
      `registry_certificates_total{source="internal",verdict="${Verdict.PASS}"} 1`,
    );
  });

  it('marks a certificate from an outside laboratory as external', async () => {
    await http()
      .post('/api/certificates')
      .send(sheet({ issuingLab: 'Outside Calibration Ltd', externalLab: true }))
      .expect(201);

    expect(await scrape()).toContain('source="external"');
  });

  it('counts a refusal under the defect that caused it', async () => {
    await http().post('/api/certificates').send(sheet({ standards: [] })).expect(422);

    expect(await scrape()).toContain(
      'registry_traceability_refused_total{defect="NO_REFERENCE"} 1',
    );
  });

  it('counts an interval that moved, and which way', async () => {
    await http().post('/api/certificates').send(sheet()).expect(201);
    await http()
      .post('/api/certificates')
      .send(sheet({ certificateNumber: 'CAL-METRIC-2', performedOn: '2025-03-11', issuedOn: '2025-03-11' }))
      .expect(201);

    expect(await scrape()).toContain('registry_interval_moves_total{basis="EXTENDED",direction="up"}');
  });

  it('counts an interval that was cut as a move downwards', async () => {
    await http()
      .post('/api/certificates')
      .send(
        sheet({
          points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0091, expandedUncertainty: 0.0005 }],
        }),
      )
      .expect(201);

    expect(await scrape()).toContain(
      'registry_interval_moves_total{basis="SHORTENED",direction="down"} 1',
    );
  });

  it('counts an impact assessment under its severity', async () => {
    await http()
      .post('/api/certificates')
      .send(
        sheet({
          points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0091, expandedUncertainty: 0.0005 }],
        }),
      )
      .expect(201);

    expect(await scrape()).toContain('registry_impact_raised_total{severity="NONE"} 1');
  });

  it('reports the open assessments as a gauge read at scrape time', async () => {
    expect(await scrape()).toContain('registry_open_assessments 0');

    await http()
      .post('/api/certificates')
      .send(
        sheet({
          points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0091, expandedUncertainty: 0.0005 }],
        }),
      )
      .expect(201);

    expect(await scrape()).toContain('registry_open_assessments 1');
  });

  it('counts a refused sign in and an accepted one apart', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/auth/sign-in')
      .send({ username: 'nobody', password: 'nothing' })
      .expect(401);

    const scraped = await scrape();

    expect(scraped).toContain('registry_sign_in_total{outcome="denied"} 1');
    expect(scraped).not.toContain('registry_sign_in_total{outcome="allowed"}');
  });

  it('never puts an asset tag or a username into a label', async () => {
    await http().post('/api/certificates').send(sheet()).expect(201);

    const scraped = await scrape();

    expect(scraped).not.toContain('SG-950001');
    expect(scraped).not.toContain('R Okonjo');
  });
});
