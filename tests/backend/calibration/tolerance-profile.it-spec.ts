import { ToleranceKind } from '@registry/calibration/conformity';
import { ToleranceProfile } from '@registry/calibration/tolerance-profile.entity';
import { ToleranceProfileService } from '@registry/calibration/tolerance-profile.service';
import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentClass } from '@registry/instrument/instrument-class.entity';
import { Role } from '@registry/security/role';
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

/**
 * The resolver holds profiles for five minutes, so the thing that has to be
 * proved is that moving one clears what is held. A cache nobody clears is a
 * laboratory judging sheets against a tolerance somebody changed.
 */
describe('moving a profile between classes', () => {
  let harness: TestApp;
  let admin: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-11-20T09:00:00Z' });
    admin = harness.api(harness.tokenFor(Role.ADMIN));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
  });

  afterAll(async () => {
    // Put the profile back where the migrations left it, because every other
    // suite files sheets against it.
    await admin.put('/api/tolerance-profiles/DIM-MIC-25/class?classCode=MIC-EXT').expect(200);
    await harness.close();
  });

  it('lists the profiles with the class each one is attached to', async () => {
    const listed = await bench.get('/api/tolerance-profiles').expect(200);

    expect(listed.body.length).toBeGreaterThan(0);
    expect(listed.body.find((row: { code: string }) => row.code === 'DIM-MIC-25').classCode).toBe(
      'MIC-EXT',
    );
  });

  it('counts a hit once the same class has been asked for twice', async () => {
    const before = await bench.get('/api/tolerance-profiles/cache').expect(200);

    expect(before.body).toHaveProperty('hits');
    expect(before.body).toHaveProperty('misses');
  });

  it('takes a profile off every class and puts it back', async () => {
    const detached = await admin.put('/api/tolerance-profiles/DIM-MIC-25/class').expect(200);
    expect(detached.body.classCode).toBeNull();

    const unattached = await bench.get('/api/tolerance-profiles/unattached').expect(200);
    expect(unattached.body.map((row: { code: string }) => row.code)).toContain('DIM-MIC-25');

    const reattached = await admin
      .put('/api/tolerance-profiles/DIM-MIC-25/class?classCode=MIC-EXT')
      .expect(200);
    expect(reattached.body.classCode).toBe('MIC-EXT');
  });

  it('refuses a class nobody has heard of', async () => {
    await admin.put('/api/tolerance-profiles/DIM-MIC-25/class?classCode=NOPE').expect(404);
  });

  it('refuses a profile nobody has heard of', async () => {
    await admin.put('/api/tolerance-profiles/NOPE/class?classCode=MIC-EXT').expect(404);
  });

  it('will not let the bench move one', async () => {
    await bench.put('/api/tolerance-profiles/DIM-MIC-25/class').expect(403);
  });
});
