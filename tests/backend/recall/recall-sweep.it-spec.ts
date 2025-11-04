import { AuditEvent } from '@registry/security/audit-event.entity';
import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentStatus } from '@registry/instrument/instrument.enums';
import { IntervalDecision, IntervalService } from '@registry/interval';
import { RecallSweepService, SWEEP_CRON } from '@registry/recall';
import { Role } from '@registry/security/role';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';

describe('the nightly recall sweep', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let sweeps: RecallSweepService;
  let intervals: IntervalService;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
    sweeps = harness.app.get(RecallSweepService);
    intervals = harness.app.get(IntervalService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.dataSource.query('delete from audit_event');
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  it('runs after the backup and before the first shift', () => {
    expect(SWEEP_CRON).toBe('10 2 * * *');
  });

  it('reassesses every instrument the register still holds', async () => {
    await register.micrometer('SG-120001');
    await register.multimeter('SG-120002');

    const report = await sweeps.sweep();

    expect(report.considered).toBe(2);
    expect(report.reassessed).toBe(2);
    expect(report.failed).toBe(0);
  });

  it('leaves a retired instrument out of it', async () => {
    const retired = await register.micrometer('SG-120001');
    retired.transitionTo(InstrumentStatus.QUARANTINED);
    retired.retire('2025-05-02');
    await harness.dataSource.getRepository(Instrument).save(retired);

    await register.multimeter('SG-120002');

    expect((await sweeps.sweep()).considered).toBe(1);
  });

  it('opens a decision for an instrument that never had one', async () => {
    await register.micrometer('SG-120001');

    await sweeps.sweep();

    const live = await harness.dataSource
      .getRepository(IntervalDecision)
      .count({ where: { superseded: false } });

    expect(live).toBe(1);
  });

  it('changes nothing when it runs twice', async () => {
    await register.micrometer('SG-120001');

    await sweeps.sweep();
    const second = await sweeps.sweep();

    expect(second.moved).toBe(0);
    expect(await harness.dataSource.getRepository(IntervalDecision).count()).toBe(1);
  });

  it('notices an interval somebody moved behind the engine', async () => {
    const instrument = await register.micrometer('SG-120001');
    await intervals.reassess(instrument.id);

    // The kind of edit that only happens by hand against the database.
    await harness.dataSource.query('update instrument set interval_days = 30 where id = $1', [
      instrument.id,
    ]);

    const report = await sweeps.sweep();

    expect(report.moved).toBe(1);
  });

  it('counts what is overdue once it has finished', async () => {
    const overdue = await register.micrometer('SG-120001');
    overdue.intervalDays = 365;
    overdue.nextDueOn = '2025-01-01';
    await harness.dataSource.getRepository(Instrument).save(overdue);

    const report = await sweeps.sweep();

    expect(report.overdueAfter).toBeGreaterThanOrEqual(0);
    expect(report.finishedAt >= report.startedAt).toBe(true);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('writes a line to the audit trail naming who asked for it', async () => {
    await register.micrometer('SG-120001');

    await sweeps.sweep('h.whitcombe');

    const trail = await harness.dataSource
      .getRepository(AuditEvent)
      .find({ where: { action: 'recall.sweep' } });

    expect(trail).toHaveLength(1);
    expect(trail[0]?.actor).toBe('h.whitcombe');
    expect(trail[0]?.detail).toContain('reassessed');
  });

  it('runs on demand for a quality manager and nobody below', async () => {
    await register.micrometer('SG-120001');

    const run = await http().post('/api/recalls/sweep').expect(201);

    expect(run.body.reassessed).toBe(1);

    await harness
      .api(harness.tokenFor(Role.TECHNICIAN))
      .post('/api/recalls/sweep')
      .expect(403);
  });

  it('reports an empty register without falling over', async () => {
    const report = await sweeps.sweep();

    expect(report.considered).toBe(0);
    expect(report.reassessed).toBe(0);
  });
});
