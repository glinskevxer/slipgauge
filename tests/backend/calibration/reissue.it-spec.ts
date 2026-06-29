import { CompetenceLevel } from '@registry/competence/competence-level';
import { Instrument } from '@registry/instrument/instrument.entity';
import { Discipline } from '@registry/instrument/instrument.enums';
import { Role } from '@registry/security/role';

import { CompetenceFixtures } from '../support/competence-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { sheet } from '../support/sheet-fixtures';
import { TestApp, createTestApp } from '../support/test-app';

/**
 * The register has no edit. A mistake is corrected by withdrawing the
 * certificate and issuing a replacement that points back at it, and both stay
 * readable for ever.
 */
describe('reissuing a certificate', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-11-25T09:00:00Z' });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER, Role.METROLOGIST));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await new CompetenceFixtures(harness.dataSource).grant(
      'r.okonjo',
      Discipline.DIMENSIONAL,
      CompetenceLevel.AUTHORISED,
    );

    const register = new RegisterFixtures(harness.dataSource);
    await register.micrometer('SG-0001');
    await register.micrometer('SG-0002');
  });

  async function file(number = 'CAL-7001') {
    const response = await quality
      .post('/api/certificates')
      .send(sheet({ certificateNumber: number }))
      .expect(201);

    return response.body;
  }

  it('withdraws the original and files the replacement in one call', async () => {
    const original = await file();

    const replacement = await quality
      .post(`/api/certificates/${original.id}/reissue?reason=the serial was wrong`)
      .send(sheet({ certificateNumber: 'CAL-7001-R1' }))
      .expect(201);

    expect(replacement.body.certificateNumber).toBe('CAL-7001-R1');
    expect(replacement.body.withdrawnAt).toBeNull();

    const withdrawn = await bench.get(`/api/certificates/${original.id}`).expect(200);
    expect(withdrawn.body.withdrawnAt).not.toBeNull();
    expect(withdrawn.body.withdrawnReason).toBe(
      'replaced by CAL-7001-R1: the serial was wrong',
    );
    expect(withdrawn.body.supersededById).toBe(replacement.body.id);
  });

  it('leaves the instrument with a live recall date from the replacement', async () => {
    const original = await file();

    await quality
      .post(`/api/certificates/${original.id}/reissue?reason=wrong standard quoted`)
      .send(sheet({ certificateNumber: 'CAL-7001-R1', performedOn: '2025-11-19' }))
      .expect(201);

    const instrument = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: 'SG-0001' });

    expect(instrument.lastCalibratedOn).toBe('2025-11-19');
    expect(instrument.nextDueOn).not.toBeNull();
  });

  it('refuses a replacement that reuses the number', async () => {
    const original = await file();

    const refused = await quality
      .post(`/api/certificates/${original.id}/reissue?reason=a typing mistake`)
      .send(sheet({ certificateNumber: 'CAL-7001' }))
      .expect(422);

    expect(refused.body.detail).toContain('needs its own number');
  });

  it('refuses a replacement for a different instrument', async () => {
    const original = await file();

    const refused = await quality
      .post(`/api/certificates/${original.id}/reissue?reason=wrong item`)
      .send(sheet({ certificateNumber: 'CAL-7001-R1', assetTag: 'SG-0002' }))
      .expect(422);

    expect(refused.body.detail).toContain('has to be for the same instrument, SG-0001');
  });

  it('refuses to reissue one that was already withdrawn', async () => {
    const original = await file();
    await quality
      .post(`/api/certificates/${original.id}/withdrawal?reason=wrong standard`)
      .expect(201);

    await quality
      .post(`/api/certificates/${original.id}/reissue?reason=again`)
      .send(sheet({ certificateNumber: 'CAL-7001-R1' }))
      .expect(409);
  });

  it('refuses to replace the same certificate twice', async () => {
    const original = await file();

    await quality
      .post(`/api/certificates/${original.id}/reissue?reason=first`)
      .send(sheet({ certificateNumber: 'CAL-7001-R1' }))
      .expect(201);
    await quality
      .post(`/api/certificates/${original.id}/reissue?reason=second`)
      .send(sheet({ certificateNumber: 'CAL-7001-R2' }))
      .expect(409);
  });

  it('reads the whole chain back, oldest first, from any revision', async () => {
    const original = await file();
    const first = await quality
      .post(`/api/certificates/${original.id}/reissue?reason=the serial was wrong`)
      .send(sheet({ certificateNumber: 'CAL-7001-R1' }))
      .expect(201);
    const second = await quality
      .post(`/api/certificates/${first.body.id}/reissue?reason=the uncertainty was wrong`)
      .send(sheet({ certificateNumber: 'CAL-7001-R2' }))
      .expect(201);

    for (const id of [original.id, first.body.id, second.body.id]) {
      const chain = await bench.get(`/api/certificates/${id}/revisions`).expect(200);

      expect(chain.body.map((row: { certificateNumber: string }) => row.certificateNumber)).toEqual(
        ['CAL-7001', 'CAL-7001-R1', 'CAL-7001-R2'],
      );
    }
  });

  it('gives a certificate that was never replaced a chain of one', async () => {
    const original = await file();

    const chain = await bench.get(`/api/certificates/${original.id}/revisions`).expect(200);
    expect(chain.body).toHaveLength(1);
  });

  it('will not let the bench reissue anything', async () => {
    const original = await file();

    await bench
      .post(`/api/certificates/${original.id}/reissue?reason=trying`)
      .send(sheet({ certificateNumber: 'CAL-7001-R1' }))
      .expect(403);
  });
});
