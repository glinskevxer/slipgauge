import { CalibrationCertificate } from '@registry/calibration/calibration-certificate.entity';
import { DemoEstateService } from '@registry/demo/demo-estate.service';
import { Instrument } from '@registry/instrument/instrument.entity';
import { IntervalDecision } from '@registry/interval';
import { AppUser } from '@registry/security/app-user.entity';
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
