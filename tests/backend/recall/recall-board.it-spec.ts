import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentStatus } from '@registry/instrument/instrument.enums';
import { IntervalService } from '@registry/interval';
import { RecallStanding } from '@registry/recall';
import { Role } from '@registry/security/role';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

/** Every date in this suite is read against this one. */
const TODAY = '2025-06-10T09:00:00Z';

describe('the recall board', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let intervals: IntervalService;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
    intervals = harness.app.get(IntervalService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  /** Puts an instrument on the board at an exact due date. */
  async function due(assetTag: string, nextDueOn: string | null): Promise<Instrument> {
    const instrument = await register.micrometer(assetTag);

    instrument.intervalDays = nextDueOn === null ? null : 365;
    instrument.nextDueOn = nextDueOn;
    instrument.lastCalibratedOn = nextDueOn === null ? null : '2024-06-10';
    return harness.dataSource.getRepository(Instrument).save(instrument);
  }

  it('bands every instrument by how far off its date is', async () => {
    await due('SG-600001', '2025-05-01');
    await due('SG-600002', '2025-06-12');
    await due('SG-600003', '2025-07-01');
    await due('SG-600004', '2025-12-01');

    const board = await http().get('/api/recalls').query({ horizonDays: 400 }).expect(200);

    const byTag = new Map(
      board.body.map((entry: { assetTag: string; standing: string }) => [
        entry.assetTag,
        entry.standing,
      ]),
    );

    expect(byTag.get('SG-600001')).toBe(RecallStanding.OVERDUE);
    expect(byTag.get('SG-600002')).toBe(RecallStanding.DUE_THIS_WEEK);
    expect(byTag.get('SG-600003')).toBe(RecallStanding.DUE_THIS_MONTH);
    expect(byTag.get('SG-600004')).toBe(RecallStanding.SCHEDULED);
  });

  it('orders the board by the date, soonest first', async () => {
    await due('SG-600003', '2025-07-01');
    await due('SG-600001', '2025-05-01');
    await due('SG-600002', '2025-06-12');

    const board = await http().get('/api/recalls').query({ horizonDays: 400 }).expect(200);

    expect(board.body.map((entry: { assetTag: string }) => entry.assetTag)).toEqual([
      'SG-600001',
      'SG-600002',
      'SG-600003',
    ]);
  });

  it('honours the horizon it is asked for', async () => {
    await due('SG-600001', '2025-06-12');
    await due('SG-600002', '2025-12-01');

    const near = await http().get('/api/recalls').query({ horizonDays: 30 }).expect(200);
    const far = await http().get('/api/recalls').query({ horizonDays: 400 }).expect(200);

    expect(near.body).toHaveLength(1);
    expect(far.body).toHaveLength(2);
  });

  it('reports how many days are left, negative once it is late', async () => {
    await due('SG-600001', '2025-05-31');
    await due('SG-600002', '2025-06-20');

    const board = await http().get('/api/recalls').query({ horizonDays: 400 }).expect(200);

    expect(board.body[0].daysUntilDue).toBe(-10);
    expect(board.body[1].daysUntilDue).toBe(10);
  });

  it('keeps a retired instrument off the board entirely', async () => {
    const retired = await due('SG-600001', '2025-05-01');
    retired.transitionTo(InstrumentStatus.QUARANTINED);
    retired.retire('2025-05-02');
    await harness.dataSource.getRepository(Instrument).save(retired);

    await due('SG-600002', '2025-05-01');

    const board = await http().get('/api/recalls').query({ horizonDays: 400 }).expect(200);

    expect(board.body.map((entry: { assetTag: string }) => entry.assetTag)).toEqual(['SG-600002']);
  });

  it('chases only what is overdue or due inside the week', async () => {
    await due('SG-600001', '2025-05-01');
    await due('SG-600002', '2025-06-12');
    await due('SG-600003', '2025-07-01');

    const chase = await http().get('/api/recalls/chase').expect(200);

    expect(chase.body.map((entry: { assetTag: string }) => entry.assetTag)).toEqual([
      'SG-600001',
      'SG-600002',
    ]);
  });

  it('lists what nobody has ever scheduled', async () => {
    await due('SG-600001', '2025-06-12');
    await due('SG-600002', null);

    const unscheduled = await http().get('/api/recalls/unscheduled').expect(200);

    expect(unscheduled.body).toHaveLength(1);
    expect(unscheduled.body[0].assetTag).toBe('SG-600002');
    expect(unscheduled.body[0].standing).toBe(RecallStanding.NOT_SCHEDULED);
    expect(unscheduled.body[0].daysUntilDue).toBeNull();
  });

  it('summarises the board into counts the console can colour', async () => {
    await due('SG-600001', '2025-05-01');
    await due('SG-600002', '2025-05-02');
    await due('SG-600003', '2025-06-12');
    await due('SG-600004', null);

    const summary = await http()
      .get('/api/recalls/summary')
      .query({ horizonDays: 400 })
      .expect(200);

    expect(summary.body.overdue).toBe(2);
    expect(summary.body.unscheduled).toBe(1);
    expect(summary.body.byStanding.OVERDUE).toBe(2);
    expect(summary.body.byStanding.DUE_THIS_WEEK).toBe(1);
    expect(summary.body.byStanding.SCHEDULED).toBe(0);
  });

  it('carries the reason the interval is what it is onto every line', async () => {
    const instrument = await due('SG-600001', '2025-06-12');
    await intervals.reassess(instrument.id);

    const board = await http().get('/api/recalls').query({ horizonDays: 400 }).expect(200);

    expect(board.body[0].intervalBasis).toBe('BASE');
    expect(board.body[0].classCode).toBe('MIC-EXT');
    expect(board.body[0].locationCode).toBe('HARLOW-DIM');
  });

  it('leaves the basis empty when no decision has ever been recorded', async () => {
    await due('SG-600001', '2025-06-12');

    const board = await http().get('/api/recalls').query({ horizonDays: 400 }).expect(200);

    expect(board.body[0].intervalBasis).toBeNull();
  });

  it('reassesses one instrument on demand and returns what it decided', async () => {
    const instrument = await due('SG-600001', '2025-06-12');

    const reassessed = await http()
      .post(`/api/recalls/instruments/${instrument.id}/reassessment`)
      .expect(201);

    expect(reassessed.body.basis).toBe('BASE');
    expect(reassessed.body.current).toBe(true);
    expect(reassessed.body.delta).toBe(0);
  });

  it('gives the decision timeline back newest first', async () => {
    const instrument = await due('SG-600001', '2025-06-12');

    await intervals.reassess(instrument.id);
    await intervals.override(instrument.id, 200, 'customer contract calls for it');

    const timeline = await http()
      .get(`/api/recalls/instruments/${instrument.id}/decisions`)
      .expect(200);

    expect(timeline.body).toHaveLength(2);
    expect(timeline.body[0].basis).toBe('MANUAL');
    expect(timeline.body[0].current).toBe(true);
    expect(timeline.body[0].delta).toBe(-165);
    expect(timeline.body[1].current).toBe(false);
  });
});
