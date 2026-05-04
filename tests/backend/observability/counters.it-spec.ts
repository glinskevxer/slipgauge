import request from 'supertest';

import { Verdict } from '@registry/calibration/conformity';
import { RegistryMetrics } from '@registry/observability';
import { Role } from '@registry/security/role';
import { StandardRole } from '@registry/traceability';
import { RegisterFixtures } from '../support/fixtures';
import { CompetenceFixtures } from '../support/competence-fixtures';
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
    await new CompetenceFixtures(harness.dataSource).authoriseApprover('R Okonjo');
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

  it('times a request under the route template, not the url', async () => {
    await http().get('/api/instruments').expect(200);

    const scraped = await scrape();

    expect(scraped).toContain('registry_request_seconds{');
    expect(scraped).toContain('route="GET /api/instruments"');
  });

  it('keeps one series per endpoint however many instruments are read', async () => {
    const first = await http().get('/api/instruments/by-tag/SG-950001').expect(200);
    await http().get(`/api/instruments/${first.body.id}`).expect(200);

    const scraped = await scrape();

    expect(scraped).toContain('route="GET /api/instruments/by-tag/:assetTag"');
    expect(scraped).not.toContain('SG-950001');
  });

  it('never puts an asset tag or a username into a label', async () => {
    await http().post('/api/certificates').send(sheet()).expect(201);

    const scraped = await scrape();

    expect(scraped).not.toContain('SG-950001');
    expect(scraped).not.toContain('R Okonjo');
  });
});

/**
 * The limiter at the edge. What matters is that it fires on the expensive
 * routes, says how long to wait, and never fires on a read.
 */
describe('turning a caller away for going too fast', () => {
  let harness: TestApp;
  let bench: ReturnType<TestApp['api']>;
  let quality: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-11-20T09:00:00Z' });
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await quality
      .put('/api/environment/limits')
      .send({ locationCode: 'HARLOW-DIM', temperatureMin: 19, temperatureMax: 21 })
      .expect(200);
  });

  function upload(hour: number) {
    return bench.post('/api/environment/readings').send({
      locationCode: 'HARLOW-DIM',
      loggerRef: `LOG-${hour}`,
      readings: [
        {
          takenAt: new Date(Date.UTC(2025, 10, 20, hour, 0, 0)).toISOString(),
          temperature: 20,
        },
      ],
    });
  }

  it('lets a normal burst of sweeping calls through', async () => {
    for (let hour = 1; hour <= 6; hour += 1) {
      await upload(hour).expect(201);
    }
  });

  it('turns the next one away and says how long to wait', async () => {
    for (let hour = 1; hour <= 6; hour += 1) {
      await upload(hour).expect(201);
    }

    const refused = await upload(7).expect(429);

    expect(refused.body.detail).toContain('too many requests');
    expect(refused.body.context.cost).toBe('SWEEPING');
    expect(refused.body.context.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('leaves the reads alone however many there are', async () => {
    for (let hour = 1; hour <= 6; hour += 1) {
      await upload(hour).expect(201);
    }
    await upload(7).expect(429);

    for (let index = 0; index < 20; index += 1) {
      await bench.get('/api/environment/excursions').expect(200);
    }
  });

  it('leaves the cheap writes alone when the expensive ones are blocked', async () => {
    for (let hour = 1; hour <= 6; hour += 1) {
      await upload(hour).expect(201);
    }
    await upload(7).expect(429);

    await bench
      .post('/api/nonconformities')
      .send({
        source: 'OTHER',
        severity: 'LOW',
        title: 'a small thing',
        detail: 'still able to raise one',
      })
      .expect(201);
  });

  it('counts the refusal so somebody can see it happening', async () => {
    for (let hour = 1; hour <= 6; hour += 1) {
      await upload(hour).expect(201);
    }
    await upload(7).expect(429);

    // The counter is a process wide total, so this reads that it moved rather
    // than that it is one: the earlier tests in this block were turned away too.
    const scrape = await request(harness.app.getHttpServer()).get('/metrics').expect(200);
    const counted = /registry_rate_limited_total\{cost="SWEEPING"\} (\d+)/.exec(scrape.text);

    expect(counted).not.toBeNull();
    expect(Number(counted?.[1])).toBeGreaterThan(0);
  });
});
