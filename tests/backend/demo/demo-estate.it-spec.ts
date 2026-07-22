import { CalibrationCertificate } from '@registry/calibration/calibration-certificate.entity';
import { DemoEstateService } from '@registry/demo/demo-estate.service';
import { Instrument } from '@registry/instrument/instrument.entity';
import { IntervalDecision } from '@registry/interval';
import { AppUser } from '@registry/security/app-user.entity';
import { Role } from '@registry/security/role';
import { CertificateStandard } from '@registry/traceability';
import { UsageRecord } from '@registry/usage/usage-record.entity';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2026-06-10T09:00:00Z';

describe('the demo laboratory', () => {
  let harness: TestApp;
  let demo: DemoEstateService;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    demo = harness.app.get(DemoEstateService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.dataSource.query("delete from app_user where username <> 'admin'");
  });

  it('builds a laboratory with a standard and a bench behind it', async () => {
    const loaded = await demo.load();

    expect(loaded).toBe(6);

    const standards = await harness.dataSource
      .getRepository(Instrument)
      .count({ where: { isReference: true } });

    expect(standards).toBe(1);
  });

  it('leaves a register that already holds something alone', async () => {
    await demo.load();

    const again = await demo.load();

    expect(again).toBe(0);
    expect(await harness.dataSource.getRepository(Instrument).count()).toBe(6);
  });

  it('creates the four people the demo signs in as', async () => {
    await demo.load();

    const staff = await harness.dataSource
      .getRepository(AppUser)
      .find({ where: {}, order: { username: 'ASC' } });

    expect(staff.map((person) => person.username)).toEqual([
      'a.mbeki',
      'admin',
      'd.ferreira',
      'h.whitcombe',
      'r.okonjo',
    ]);
  });

  it('gives three years of history to every instrument', async () => {
    await demo.load();

    const certificates = await harness.dataSource.getRepository(CalibrationCertificate).count();

    expect(certificates).toBe(18);
  });

  it('files every certificate against a standard, so no chain is broken', async () => {
    await demo.load();

    const edges = await harness.dataSource.getRepository(CertificateStandard).count();

    expect(edges).toBe(18);
  });

  it('leaves every instrument with a live interval decision and a due date', async () => {
    await demo.load();

    const live = await harness.dataSource
      .getRepository(IntervalDecision)
      .count({ where: { superseded: false } });
    const scheduled = await harness.dataSource
      .getRepository(Instrument)
      .createQueryBuilder('instrument')
      .where('instrument.next_due_on is not null')
      .getCount();

    expect(live).toBe(6);
    expect(scheduled).toBe(6);
  });

  it('leaves forty jobs behind for an impact walk to find', async () => {
    await demo.load();

    expect(await harness.dataSource.getRepository(UsageRecord).count()).toBe(40);
  });

  it('builds the same laboratory twice from the same seed', async () => {
    await demo.load();

    const first = await harness.dataSource
      .getRepository(CalibrationCertificate)
      .find({ order: { certificateNumber: 'ASC' } });

    await harness.reset();
    await harness.dataSource.query("delete from app_user where username <> 'admin'");

    // A fresh service, so the generator starts from the same seed again.
    const second = await createTestApp({ now: TODAY });

    await second.app.get(DemoEstateService).load();

    const rebuilt = await second.dataSource
      .getRepository(CalibrationCertificate)
      .find({ order: { certificateNumber: 'ASC' } });

    expect(rebuilt.map((each) => each.performedOn)).toEqual(
      first.map((each) => each.performedOn),
    );
    await second.close();
  });

  it('picks a nominal every instrument can actually reach', async () => {
    await demo.load();

    const instruments = await harness.dataSource.getRepository(Instrument).find();
    const certificates = await harness.dataSource
      .getRepository(CalibrationCertificate)
      .find({ relations: { instrument: true, points: true } });

    for (const certificate of certificates) {
      const instrument = instruments.find(
        (each) => each.id === certificate.instrument.id,
      ) as Instrument;

      for (const point of certificate.points) {
        expect(instrument.covers(point.nominal)).toBe(true);
      }
    }
  });

  it('drifts the readings year on year, so the chart has something to draw', async () => {
    await demo.load();

    const history = await harness.dataSource.getRepository(CalibrationCertificate).find({
      where: { instrument: { assetTag: 'SG-000002' } },
      relations: { points: true },
      order: { performedOn: 'ASC' },
    });

    const errors = history.map((certificate) =>
      Math.abs(certificate.points[0]?.asFoundError() ?? 0),
    );

    expect(errors).toHaveLength(3);
    expect(errors[1]).toBeGreaterThan(errors[0] as number);
    expect(errors[2]).toBeGreaterThan(errors[1] as number);
  });
});

/**
 * The parts of the demo that arrived with the later subsystems. A demo that
 * loads a laboratory with no schedule, no room log and nothing on the job desk
 * shows three screens that look broken.
 */
describe('what else the demo loads', () => {
  let harness: TestApp;
  let http: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-12-01T09:00:00Z' });
    http = harness.api(harness.tokenFor(Role.QUALITY_MANAGER, Role.METROLOGIST));
    await harness.reset();
    await harness.app.get(DemoEstateService).load();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('writes a schedule of accreditation', async () => {
    const schedule = await http.get('/api/scope').expect(200);

    expect(schedule.body.length).toBeGreaterThanOrEqual(3);
    expect(schedule.body.map((line: { scheduleRef: string }) => line.scheduleRef)).toContain(
      'UKAS-0001/01',
    );
  });

  it('holds the working rooms to a band', async () => {
    const limits = await http.get('/api/environment/limits').expect(200);

    expect(limits.body.map((row: { locationCode: string }) => row.locationCode).sort()).toEqual([
      'CREWE-TOOL',
      'HARLOW-DIM',
    ]);
  });

  it('leaves a week of readings with one afternoon that went wrong', async () => {
    const excursions = await http.get('/api/environment/excursions').expect(200);

    expect(excursions.body.length).toBeGreaterThanOrEqual(1);
    expect(excursions.body[0].locationCode).toBe('HARLOW-DIM');
    expect(excursions.body[0].kind).toBe('TEMPERATURE_HIGH');
  });

  it('raises a nonconformance off that afternoon, like the real thing would', async () => {
    const raised = await http.get('/api/nonconformities').expect(200);

    expect(raised.body.some((row: { source: string }) => row.source === 'EXCURSION')).toBe(true);
  });

  it('opens three customers with a job each, left at received', async () => {
    const customers = await http.get('/api/customers').expect(200);
    expect(customers.body).toHaveLength(3);

    const jobs = await http.get('/api/jobs').expect(200);
    expect(jobs.body.totalItems).toBe(3);
    expect(jobs.body.items.every((row: { state: string }) => row.state === 'RECEIVED')).toBe(true);
  });

  it('books two lines onto each job so contract review has something to read', async () => {
    const jobs = await http.get('/api/jobs').expect(200);

    expect(jobs.body.items.every((row: { itemCount: number }) => row.itemCount === 2)).toBe(true);
  });

  it('leaves the demo certificates carrying the mark', async () => {
    const history = await http.get('/api/instruments/SG-000001/certificates').expect(200);

    expect(history.body.length).toBeGreaterThan(0);
    expect(history.body.some((row: { accredited: boolean }) => row.accredited)).toBe(true);
  });

  it('builds a management review pack with something in it', async () => {
    const pack = await http
      .get('/api/management-review?from=2023-01-01&to=2025-12-31')
      .expect(200);

    expect(pack.body.resources.instrumentsInService).toBeGreaterThan(0);
    expect(pack.body.workload.certificatesIssued).toBeGreaterThan(0);
    expect(pack.body.talkingPoints.length).toBeGreaterThan(0);
  });

  it('loads the same laboratory twice rather than a second one', async () => {
    const before = await http.get('/api/customers').expect(200);

    await harness.app.get(DemoEstateService).load();

    const after = await http.get('/api/customers').expect(200);
    expect(after.body).toHaveLength(before.body.length);
  });
});

/**
 * The loan book. A demo where everything is where it should be shows an empty
 * screen and teaches nobody what the screen is for.
 */
describe('what the demo has on loan', () => {
  let harness: TestApp;
  let http: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-12-01T09:00:00Z' });
    http = harness.api(harness.tokenFor(Role.TECHNICIAN));
    await harness.reset();
    await harness.app.get(DemoEstateService).load();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('has one instrument out on site', async () => {
    const out = await http.get('/api/loans').expect(200);

    expect(out.body).toHaveLength(1);
    expect(out.body[0]).toMatchObject({
      borrower: 'J Fenwick',
      destination: 'Fenland Turbines, Wisbech',
      out: true,
    });
  });

  it('leaves it overdue, which is the state the screen is for', async () => {
    const out = await http.get('/api/loans').expect(200);

    expect(out.body[0].overdue).toBe(true);
    expect(out.body[0].lateness).toBeGreaterThan(0);
  });

  it('marks the instrument itself as out rather than in service', async () => {
    const out = await http.get('/api/loans').expect(200);
    const instrument = await http.get(`/api/instruments/by-tag/${out.body[0].assetTag}`).expect(200);

    expect(instrument.body.status).toBe('ON_LOAN');
  });

  it('does not lend a second one when the demo is loaded again', async () => {
    await harness.app.get(DemoEstateService).load();

    const out = await http.get('/api/loans').expect(200);
    expect(out.body).toHaveLength(1);
  });
});
