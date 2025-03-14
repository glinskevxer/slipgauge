import { ToleranceKind } from '@registry/calibration/conformity';
import { ToleranceProfile } from '@registry/calibration/tolerance-profile.entity';
import { ToleranceProfileService } from '@registry/calibration/tolerance-profile.service';
import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentClass } from '@registry/instrument/instrument-class.entity';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

describe('the tolerance profiles the migrations ship', () => {
  let harness: TestApp;
  let fixtures: RegisterFixtures;
  let profiles: ToleranceProfileService;

  beforeAll(async () => {
    harness = await createTestApp();
    fixtures = new RegisterFixtures(harness.dataSource);
    profiles = harness.app.get(ToleranceProfileService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('gives every instrument class exactly one profile to fall back on', async () => {
    const classes = await harness.dataSource.getRepository(InstrumentClass).count();
    const attached = await harness.dataSource
      .getRepository(ToleranceProfile)
      .createQueryBuilder('profile')
      .where('profile.class_id is not null')
      .getCount();

    expect(classes).toBe(30);
    expect(attached).toBe(classes);
  });

  it('refuses a second profile on a class that already has one', async () => {
    const type = await harness.dataSource
      .getRepository(InstrumentClass)
      .findOneByOrFail({ code: 'MIC-EXT' });

    const duplicate = new ToleranceProfile();
    duplicate.code = 'DIM-MIC-25-DUP';
    duplicate.name = 'A second profile for the same class';
    duplicate.kind = ToleranceKind.ABSOLUTE;
    duplicate.instrumentClass = type;
    duplicate.withTerms(0.004, 0, 0, 0);

    await expect(
      harness.dataSource.getRepository(ToleranceProfile).save(duplicate),
    ).rejects.toThrow();
  });

  it('keeps the shipped micrometer profile on the class it was written for', async () => {
    const profile = await profiles.byCode('DIM-MIC-25');

    expect(profile.instrumentClass?.code).toBe('MIC-EXT');
    expect(profile.kind).toBe(ToleranceKind.ABSOLUTE);
    expect(profile.absoluteTerm).toBeCloseTo(0.004, 9);
  });

  it('inherits the class profile when the instrument carries none of its own', async () => {
    const saved = await fixtures.micrometer('SG-100001');
    const micrometer = await harness.dataSource.getRepository(Instrument).findOneOrFail({
      where: { id: saved.id },
      relations: { instrumentClass: true },
    });

    expect(micrometer.toleranceProfileId).toBeNull();
    expect((await profiles.resolveFor(micrometer))?.code).toBe('DIM-MIC-25');
  });

  it('prefers a profile put on the instrument itself over the class one', async () => {
    const blocks = await fixtures.gaugeBlockSet('SG-100002');
    const tighter = await profiles.byCode('DIM-GB-K');

    blocks.toleranceProfile = tighter;
    await harness.dataSource.getRepository(Instrument).save(blocks);

    const reloaded = await harness.dataSource.getRepository(Instrument).findOneOrFail({
      where: { id: blocks.id },
      relations: { instrumentClass: true },
    });

    expect(await profiles.resolveFor(reloaded)).toMatchObject({ code: 'DIM-GB-K' });
  });

  it('works out the band at a nominal from the instrument span', async () => {
    const micrometer = await fixtures.micrometer('SG-100003');
    const band = await profiles.bandFor(micrometer, 20);

    expect(band.low).toBeCloseTo(19.996, 9);
    expect(band.high).toBeCloseTo(20.004, 9);
  });

  it('scales a percent of span profile by the instrument that carries it', async () => {
    const multimeter = await fixtures.multimeter('SG-100004');
    const band = await profiles.bandFor(multimeter, 10);

    // DMM-BENCH inherits the combined six and a half digit profile: 35 ppm of
    // reading plus 5 ppm of the 2000 V span, floored at one microvolt.
    expect(band.halfWidth()).toBeCloseTo(10 * 0.000035 + 2000 * 0.000005, 9);
  });

  it('reports a profile that no class points at', async () => {
    const orphan = new ToleranceProfile();
    orphan.code = 'DIM-ORPHAN';
    orphan.name = 'Written for a class we never bought';
    orphan.kind = ToleranceKind.ABSOLUTE;
    orphan.instrumentClass = null;
    orphan.withTerms(0.002, 0, 0, 0);
    await harness.dataSource.getRepository(ToleranceProfile).save(orphan);

    const found = await profiles.unattached();

    expect(found.map((profile) => profile.code)).toEqual(['DIM-ORPHAN']);

    await harness.dataSource.getRepository(ToleranceProfile).remove(orphan);
  });

  it('reports an unknown profile code as a not found rather than a null', async () => {
    await expect(profiles.byCode('NOPE')).rejects.toThrow('does not exist');
  });

  it('refuses a term that the check constraint would not accept either', async () => {
    const bad = new ToleranceProfile();
    bad.code = 'DIM-BAD';
    bad.name = 'Negative absolute term';
    bad.kind = ToleranceKind.ABSOLUTE;
    bad.instrumentClass = null;

    expect(() => bad.withTerms(-0.001, 0, 0, 0)).toThrow('cannot be negative');
  });
});
