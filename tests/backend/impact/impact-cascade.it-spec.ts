import { Verdict } from '@registry/calibration/conformity';
import {
  ImpactDisposition,
  ImpactKind,
  ImpactService,
  ImpactSeverity,
  ImpactStatus,
} from '@registry/impact';
import { Instrument } from '@registry/instrument/instrument.entity';
import { Role } from '@registry/security/role';
import { CalibrationFixtures, UsageFixtures } from '../support/calibration-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';

describe('what an out of tolerance result reached', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let calibrations: CalibrationFixtures;
  let uses: UsageFixtures;
  let impact: ImpactService;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
    calibrations = new CalibrationFixtures(harness.dataSource);
    uses = new UsageFixtures(harness.dataSource);
    impact = harness.app.get(ImpactService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  /** A gauge block set held as a reference standard. */
  async function standard(assetTag: string): Promise<Instrument> {
    return calibrations.asStandard(await register.gaugeBlockSet(assetTag));
  }

  it('opens the window at the last calibration the instrument was good at', async () => {
    const micrometer = await register.micrometer('SG-800001');

    await calibrations.certificate(micrometer, {
      number: 'CAL-GOOD',
      performedOn: '2024-03-04',
      verdict: Verdict.PASS,
    });
    const bad = await calibrations.certificate(micrometer, {
      number: 'CAL-BAD',
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);

    expect(raised?.windowFrom).toBe('2024-03-04');
    expect(raised?.windowTo).toBe('2025-03-04');
  });

  it('opens the window at the acquisition date when there is no good result behind it', async () => {
    const micrometer = await register.micrometer('SG-800001');
    const bad = await calibrations.certificate(micrometer, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);

    expect(raised?.windowFrom).toBe('2021-03-01');
  });

  it('skips a failing certificate behind it when it looks for the last good one', async () => {
    const micrometer = await register.micrometer('SG-800001');

    await calibrations.certificate(micrometer, {
      number: 'CAL-GOOD',
      performedOn: '2023-03-04',
      verdict: Verdict.PASS,
    });
    await calibrations.certificate(micrometer, {
      number: 'CAL-BAD-1',
      performedOn: '2024-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });
    const worse = await calibrations.certificate(micrometer, {
      number: 'CAL-BAD-2',
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    expect((await impact.raiseIfFailing(worse))?.windowFrom).toBe('2023-03-04');
  });

  it('raises nothing at all for a certificate that passed', async () => {
    const micrometer = await register.micrometer('SG-800001');
    const good = await calibrations.certificate(micrometer, { verdict: Verdict.PASS });

    expect(await impact.raiseIfFailing(good)).toBeNull();
  });

  it('catches every job inside the window and nothing outside it', async () => {
    const micrometer = await register.micrometer('SG-800001');

    await calibrations.certificate(micrometer, {
      number: 'CAL-GOOD',
      performedOn: '2024-03-04',
      verdict: Verdict.PASS,
    });

    await uses.use(micrometer, '2024-02-01', 'WO-BEFORE');
    await uses.use(micrometer, '2024-06-01', 'WO-INSIDE-1');
    await uses.use(micrometer, '2025-01-15', 'WO-INSIDE-2');
    await uses.use(micrometer, '2025-04-01', 'WO-AFTER');

    const bad = await calibrations.certificate(micrometer, {
      number: 'CAL-BAD',
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);
    const caught = (raised?.items ?? []).filter((item) => item.kind === ImpactKind.USAGE);

    expect(caught.map((item) => item.label)).toEqual([
      'A Technician on WO-INSIDE-1 for Fenwick Aerospace',
      'A Technician on WO-INSIDE-2 for Fenwick Aerospace',
    ]);
  });

  it('grades a handful of jobs with no propagation as low', async () => {
    const micrometer = await register.micrometer('SG-800001');

    await uses.use(micrometer, '2024-06-01');
    const bad = await calibrations.certificate(micrometer, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);

    expect(raised?.severity).toBe(ImpactSeverity.LOW);
    expect(raised?.maxDepth).toBe(0);
    expect(raised?.status).toBe(ImpactStatus.ASSESSED);
  });

  it('follows a failed standard into the certificates it signed off', async () => {
    const blocks = await standard('SG-800010');
    const micrometer = await register.micrometer('SG-800001');

    const downstream = await calibrations.certificate(micrometer, {
      number: 'CAL-DOWNSTREAM',
      performedOn: '2024-08-01',
    });
    await calibrations.measuredAgainst(downstream, blocks);

    const bad = await calibrations.certificate(blocks, {
      number: 'CAL-STD-BAD',
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);
    const kinds = (raised?.items ?? []).map((item) => item.kind);

    expect(kinds).toContain(ImpactKind.CERTIFICATE);
    expect(kinds).toContain(ImpactKind.INSTRUMENT);
    expect(raised?.maxDepth).toBe(1);
    expect(raised?.severity).toBe(ImpactSeverity.HIGH);
  });

  it('narrows the window at each hop to the day the standard touched it', async () => {
    const blocks = await standard('SG-800010');
    const micrometer = await register.micrometer('SG-800001');

    // Used well before the downstream calibration, so this job is not suspect
    // even though it sits inside the standard's own window.
    await uses.use(micrometer, '2024-02-01', 'WO-BEFORE-CAL');
    await uses.use(micrometer, '2024-09-01', 'WO-AFTER-CAL');

    const downstream = await calibrations.certificate(micrometer, {
      number: 'CAL-DOWNSTREAM',
      performedOn: '2024-08-01',
    });
    await calibrations.measuredAgainst(downstream, blocks);

    const bad = await calibrations.certificate(blocks, {
      number: 'CAL-STD-BAD',
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);
    const jobs = (raised?.items ?? [])
      .filter((item) => item.kind === ImpactKind.USAGE)
      .map((item) => item.label);

    expect(jobs).toEqual(['A Technician on WO-AFTER-CAL for Fenwick Aerospace']);
  });

  it('does not follow a standard that was only there as a check', async () => {
    const blocks = await standard('SG-800010');
    const micrometer = await register.micrometer('SG-800001');

    const downstream = await calibrations.certificate(micrometer, { performedOn: '2024-08-01' });
    await calibrations.measuredAgainst(downstream, blocks, 'CHECK' as never);

    const bad = await calibrations.certificate(blocks, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);

    expect((raised?.items ?? []).some((item) => item.kind === ImpactKind.CERTIFICATE)).toBe(false);
  });

  it('walks two hops when the instrument it hit is itself a standard', async () => {
    const primary = await standard('SG-800010');
    const secondary = await standard('SG-800011');
    const working = await register.micrometer('SG-800001');

    const secondaryCert = await calibrations.certificate(secondary, {
      number: 'CAL-SECONDARY',
      performedOn: '2024-05-01',
    });
    await calibrations.measuredAgainst(secondaryCert, primary);

    const workingCert = await calibrations.certificate(working, {
      number: 'CAL-WORKING',
      performedOn: '2024-09-01',
    });
    await calibrations.measuredAgainst(workingCert, secondary);

    const bad = await calibrations.certificate(primary, {
      number: 'CAL-PRIMARY-BAD',
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);

    expect(raised?.maxDepth).toBe(2);
    expect(raised?.severity).toBe(ImpactSeverity.HIGH);
    expect(
      (raised?.items ?? []).filter((item) => item.kind === ImpactKind.INSTRUMENT).length,
    ).toBe(2);
  });

  it('records each thing once however many branches reach it', async () => {
    const blocks = await standard('SG-800010');
    const micrometer = await register.micrometer('SG-800001');

    const first = await calibrations.certificate(micrometer, {
      number: 'CAL-1',
      performedOn: '2024-06-01',
    });
    const second = await calibrations.certificate(micrometer, {
      number: 'CAL-2',
      performedOn: '2024-09-01',
    });
    await calibrations.measuredAgainst(first, blocks);
    await calibrations.measuredAgainst(second, blocks);

    const bad = await calibrations.certificate(blocks, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const raised = await impact.raiseIfFailing(bad);
    const instruments = (raised?.items ?? []).filter(
      (item) => item.kind === ImpactKind.INSTRUMENT,
    );

    expect(instruments).toHaveLength(1);
    expect(
      (raised?.items ?? []).filter((item) => item.kind === ImpactKind.CERTIFICATE),
    ).toHaveLength(2);
  });

  it('raises the assessment on its own when a failing sheet is filed', async () => {
    const micrometer = await register.micrometer('SG-800001');
    await uses.use(micrometer, '2024-06-01');

    await http()
      .post('/api/certificates')
      .send({
        certificateNumber: 'CAL-FILED',
        assetTag: 'SG-800001',
        performedOn: '2025-03-04',
        issuedOn: '2025-03-04',
        performedBy: 'R Okonjo',
        issuingLab: 'Slipgauge Metrology',
        points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0091, expandedUncertainty: 0.0005 }],
        standards: [
          {
            externalRef: 'NPL 2024/117',
            externalLab: 'National Physical Laboratory',
            externalValidFrom: '2020-01-01',
            externalValidTo: '2029-12-31',
            role: 'REFERENCE',
          },
        ],
      })
      .expect(201);

    const queue = await http().get('/api/impact').expect(200);

    expect(queue.body).toHaveLength(1);
    expect(queue.body[0].assetTag).toBe('SG-800001');
    expect(queue.body[0].pendingCount).toBe(1);
  });

  it('will not close an assessment while a line is still pending', async () => {
    const micrometer = await register.micrometer('SG-800001');
    await uses.use(micrometer, '2024-06-01');

    const bad = await calibrations.certificate(micrometer, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });
    const raised = await impact.raiseIfFailing(bad);

    const refused = await http()
      .post(`/api/impact/${raised?.id}/closure`)
      .send({ closedBy: 'Q Manager', conclusion: 'nothing to see' })
      .expect(422);

    expect(refused.body.detail).toContain('every item has to be disposed of');
  });

  it('closes once every line has been disposed of with a note', async () => {
    const micrometer = await register.micrometer('SG-800001');
    await uses.use(micrometer, '2024-06-01');

    const bad = await calibrations.certificate(micrometer, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });
    const raised = await impact.raiseIfFailing(bad);
    const view = await impact.get(raised?.id as number);

    await http()
      .post(`/api/impact/${raised?.id}/items/${view.items[0]?.id}/disposition`)
      .send({
        disposition: ImpactDisposition.NO_EFFECT,
        note: 'job tolerance is ten times the error found',
      })
      .expect(201);

    const closed = await http()
      .post(`/api/impact/${raised?.id}/closure`)
      .send({ closedBy: 'Q Manager', conclusion: 'no customer impact, no rework needed' })
      .expect(201);

    expect(closed.body.status).toBe(ImpactStatus.CLOSED);
    expect(closed.body.closedBy).toBe('Q Manager');
    expect(closed.body.pendingCount).toBe(0);
  });

  it('refuses a disposition with no note behind it', async () => {
    const micrometer = await register.micrometer('SG-800001');
    await uses.use(micrometer, '2024-06-01');

    const bad = await calibrations.certificate(micrometer, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });
    const raised = await impact.raiseIfFailing(bad);
    const view = await impact.get(raised?.id as number);

    await http()
      .post(`/api/impact/${raised?.id}/items/${view.items[0]?.id}/disposition`)
      .send({ disposition: ImpactDisposition.RECALLED })
      .expect(422);
  });

  it('does not raise a second assessment for the same certificate', async () => {
    const micrometer = await register.micrometer('SG-800001');
    const bad = await calibrations.certificate(micrometer, {
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const first = await impact.raiseIfFailing(bad);
    const second = await impact.raiseIfFailing(bad);

    expect(second?.id).toBe(first?.id);
    expect(await impact.open()).toHaveLength(1);
  });

  it('lists the worst assessment first in the queue', async () => {
    const blocks = await standard('SG-800010');
    const micrometer = await register.micrometer('SG-800001');

    // After CAL-DOWN below, so it still falls inside the micrometer's own
    // suspect window once that certificate becomes its last known good one.
    await uses.use(micrometer, '2024-09-01');
    const smallBad = await calibrations.certificate(micrometer, {
      number: 'CAL-SMALL',
      performedOn: '2025-03-04',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    const downstream = await calibrations.certificate(micrometer, {
      number: 'CAL-DOWN',
      performedOn: '2024-08-01',
    });
    await calibrations.measuredAgainst(downstream, blocks);
    const bigBad = await calibrations.certificate(blocks, {
      number: 'CAL-BIG',
      performedOn: '2025-03-05',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });

    await impact.raiseIfFailing(smallBad);
    await impact.raiseIfFailing(bigBad);

    const queue = await http().get('/api/impact').expect(200);

    expect(queue.body[0].severity).toBe(ImpactSeverity.HIGH);
    expect(queue.body[1].severity).toBe(ImpactSeverity.LOW);
  });
});
