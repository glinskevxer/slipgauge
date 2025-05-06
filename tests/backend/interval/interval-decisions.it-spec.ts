import { Verdict } from '@registry/calibration/conformity';
import { Instrument } from '@registry/instrument/instrument.entity';
import { IntervalBasis, IntervalDecision, IntervalService } from '@registry/interval';
import { StandardRole } from '@registry/traceability';
import { Role } from '@registry/security/role';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

describe('recording what the interval engine decided', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let intervals: IntervalService;

  beforeAll(async () => {
    harness = await createTestApp();
    register = new RegisterFixtures(harness.dataSource);
    intervals = harness.app.get(IntervalService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await register.micrometer('SG-500001');
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  const OUTSIDE = {
    externalRef: 'NPL 2024/117',
    externalLab: 'National Physical Laboratory',
    externalValidFrom: '2020-01-01',
    externalValidTo: '2029-12-31',
    role: StandardRole.REFERENCE,
  };

  function sheet(number: string, performedOn: string, asFound: number) {
    return {
      certificateNumber: number,
      assetTag: 'SG-500001',
      performedOn,
      issuedOn: performedOn,
      performedBy: 'R Okonjo',
      issuingLab: 'Slipgauge Metrology',
      points: [{ sequenceNo: 1, nominal: 20, asFound, expandedUncertainty: 0.0005 }],
      standards: [OUTSIDE],
    };
  }

  async function tag(assetTag: string): Promise<Instrument> {
    return harness.dataSource.getRepository(Instrument).findOneByOrFail({ assetTag });
  }

  it('opens a decision at the class base as soon as one is asked for', async () => {
    const instrument = await tag('SG-500001');
    const decision = await intervals.reassess(instrument.id);

    expect(decision.basis).toBe(IntervalBasis.BASE);
    expect(decision.intervalDays).toBe(365);
    expect(decision.effectiveFrom).toBe('2021-03-01');
    expect(decision.previousIntervalDays).toBeNull();
  });

  it('writes the interval and the due date down onto the instrument', async () => {
    const instrument = await tag('SG-500001');
    await intervals.reassess(instrument.id);

    const reloaded = await tag('SG-500001');

    expect(reloaded.intervalDays).toBe(365);
    expect(reloaded.nextDueOn).toBe('2022-03-01');
    expect(reloaded.lastCalibratedOn).toBeNull();
  });

  it('does not write a second row when nothing about the answer changed', async () => {
    const instrument = await tag('SG-500001');

    await intervals.reassess(instrument.id);
    await intervals.reassess(instrument.id);
    await intervals.reassess(instrument.id);

    const rows = await harness.dataSource.getRepository(IntervalDecision).count();

    expect(rows).toBe(1);
  });

  it('moves the schedule on when a sheet is filed', async () => {
    await http().post('/api/certificates').send(sheet('CAL-1', '2025-02-11', 20.0004)).expect(201);

    const instrument = await tag('SG-500001');

    expect(instrument.lastCalibratedOn).toBe('2025-02-11');
    expect(instrument.nextDueOn).toBe('2026-02-11');
    expect(instrument.intervalDays).toBe(365);
  });

  it('cuts the interval on an out of tolerance sheet', async () => {
    await http().post('/api/certificates').send(sheet('CAL-1', '2025-02-11', 20.0091)).expect(201);

    const instrument = await tag('SG-500001');
    const decision = await intervals.current(instrument.id);

    expect(decision?.basis).toBe(IntervalBasis.SHORTENED);
    expect(instrument.intervalDays).toBe(183);
    expect(instrument.nextDueOn).toBe('2025-08-13');
  });

  it('extends the interval after a clean run and records the step it took', async () => {
    await http().post('/api/certificates').send(sheet('CAL-1', '2024-02-11', 20.0002)).expect(201);
    await http().post('/api/certificates').send(sheet('CAL-2', '2025-02-11', 20.0002)).expect(201);

    const instrument = await tag('SG-500001');
    const decision = await intervals.current(instrument.id);

    expect(decision?.basis).toBe(IntervalBasis.EXTENDED);
    expect(decision?.previousIntervalDays).toBe(365);
    expect(instrument.intervalDays).toBeGreaterThan(365);
  });

  it('keeps exactly one live decision however many are made', async () => {
    await http().post('/api/certificates').send(sheet('CAL-1', '2024-02-11', 20.0002)).expect(201);
    await http().post('/api/certificates').send(sheet('CAL-2', '2025-02-11', 20.0091)).expect(201);

    const live = await harness.dataSource
      .getRepository(IntervalDecision)
      .count({ where: { superseded: false } });
    const total = await harness.dataSource.getRepository(IntervalDecision).count();

    expect(live).toBe(1);
    expect(total).toBeGreaterThan(1);
  });

  it('gives the interval back when the failing certificate is withdrawn', async () => {
    await http().post('/api/certificates').send(sheet('CAL-1', '2024-02-11', 20.0002)).expect(201);
    const failing = await http()
      .post('/api/certificates')
      .send(sheet('CAL-2', '2025-02-11', 20.0091))
      .expect(201);

    expect((await tag('SG-500001')).intervalDays).toBe(183);

    await http()
      .post(`/api/certificates/${failing.body.id}/withdrawal`)
      .query({ reason: 'the standard it leaned on was found out of tolerance' })
      .expect(201);

    const instrument = await tag('SG-500001');

    expect(instrument.intervalDays).toBe(365);
    expect(instrument.lastCalibratedOn).toBe('2024-02-11');
  });

  it('keeps every superseded decision as the record of how it moved', async () => {
    await http().post('/api/certificates').send(sheet('CAL-1', '2024-02-11', 20.0002)).expect(201);
    await http().post('/api/certificates').send(sheet('CAL-2', '2025-02-11', 20.0091)).expect(201);

    const instrument = await tag('SG-500001');
    const history = await intervals.historyFor(instrument.id);

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.filter((each) => each.superseded).length).toBe(history.length - 1);
  });

  it('lets a person override the engine with a written reason', async () => {
    const instrument = await tag('SG-500001');
    const decision = await intervals.override(instrument.id, 200, 'customer contract calls for it');

    expect(decision.basis).toBe(IntervalBasis.MANUAL);
    expect(decision.intervalDays).toBe(200);
    expect(decision.rationale).toContain('customer contract');
    expect((await tag('SG-500001')).intervalDays).toBe(200);
  });

  it('refuses an override with no reason, and one outside the class window', async () => {
    const instrument = await tag('SG-500001');

    await expect(intervals.override(instrument.id, 200, '  ')).rejects.toThrow('written reason');
    await expect(intervals.override(instrument.id, 30, 'because')).rejects.toThrow(
      'allows 180 to 730 days',
    );
  });

  it('records the certificate that triggered the decision', async () => {
    const filed = await http()
      .post('/api/certificates')
      .send(sheet('CAL-1', '2025-02-11', 20.0002))
      .expect(201);

    const instrument = await tag('SG-500001');
    const decision = await intervals.current(instrument.id);

    expect(decision?.triggeredById).toBe(filed.body.id);
    expect(decision?.dueDate()).toBe('2026-02-11');
  });

  it('carries the drift that was measured into the decision record', async () => {
    await http().post('/api/certificates').send(sheet('CAL-1', '2025-02-11', 20.0036)).expect(201);

    const instrument = await tag('SG-500001');
    const decision = await intervals.current(instrument.id);

    expect(decision?.driftRatio).toBeCloseTo(0.9, 3);
    expect(decision?.consecutivePasses).toBe(1);
    expect(decision?.basis).toBe(IntervalBasis.HELD);
    expect((await tag('SG-500001')).daysUntilDue('2025-02-11')).toBe(365);
  });

  it('reports an unknown instrument rather than opening a decision for it', async () => {
    await expect(intervals.reassess(999_999)).rejects.toThrow('does not exist');
  });
});
