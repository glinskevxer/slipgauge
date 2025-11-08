import { AttachmentKind } from '@registry/calibration/certificate-attachment.entity';
import { Verdict } from '@registry/calibration/conformity';
import { AuditEvent } from '@registry/security/audit-event.entity';
import { Role } from '@registry/security/role';
import { CalibrationFixtures } from '../support/calibration-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';
const SCAN = 'b'.repeat(64);
const RAW = 'c'.repeat(64);

describe('the files that belong to a certificate', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let calibrations: CalibrationFixtures;
  let certificateId: number;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
    calibrations = new CalibrationFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.dataSource.query('delete from audit_event');

    const instrument = await register.micrometer('SG-130001');
    const certificate = await calibrations.certificate(instrument, { verdict: Verdict.PASS });

    certificateId = certificate.id;
  });

  const http = () => harness.api(harness.tokenFor(Role.ADMIN));

  function file(overrides: Record<string, unknown> = {}) {
    return {
      kind: AttachmentKind.CERTIFICATE_SCAN,
      filename: 'CAL-FIX-0001.pdf',
      mediaType: 'application/pdf',
      byteSize: 240_000,
      sha256: SCAN,
      storageKey: 'certificates/2025/CAL-FIX-0001.pdf',
      ...overrides,
    };
  }

  it('records a file the document store already holds', async () => {
    const attached = await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file())
      .expect(201);

    expect(attached.body.filename).toBe('CAL-FIX-0001.pdf');
    expect(attached.body.readableSize).toBe('234.4 kB');
    expect(attached.body.shortChecksum).toBe('bbbbbbbb');
    expect(attached.body.uploadedBy).toBe('suite.runner');
  });

  it('lists what is on a certificate, scan first', async () => {
    await http().post(`/api/certificates/${certificateId}/attachments`).send(file()).expect(201);
    await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(
        file({
          kind: AttachmentKind.RAW_DATA,
          filename: 'run.csv',
          mediaType: 'text/csv',
          byteSize: 900,
          sha256: RAW,
          storageKey: 'raw/2025/run.csv',
        }),
      )
      .expect(201);

    const listed = await http().get(`/api/certificates/${certificateId}/attachments`).expect(200);

    expect(listed.body.map((each: { kind: string }) => each.kind)).toEqual([
      AttachmentKind.CERTIFICATE_SCAN,
      AttachmentKind.RAW_DATA,
    ]);
  });

  it('refuses a second signed scan on the same certificate', async () => {
    await http().post(`/api/certificates/${certificateId}/attachments`).send(file()).expect(201);

    const refused = await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file({ sha256: RAW, storageKey: 'certificates/2025/again.pdf' }))
      .expect(409);

    expect(refused.body.detail).toContain('already has a signed scan');
  });

  it('refuses the same file twice on one certificate', async () => {
    await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file({ kind: AttachmentKind.RAW_DATA, storageKey: 'raw/a.csv' }))
      .expect(201);

    const refused = await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file({ kind: AttachmentKind.PHOTOGRAPH, storageKey: 'raw/b.csv' }))
      .expect(409);

    expect(refused.body.detail).toContain('already on');
  });

  it('refuses two certificates pointing at the same stored file', async () => {
    const second = await calibrations.certificate(
      await register.multimeter('SG-130002'),
      { number: 'CAL-FIX-0002' },
    );

    await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file({ kind: AttachmentKind.RAW_DATA }))
      .expect(201);

    const refused = await http()
      .post(`/api/certificates/${second.id}/attachments`)
      .send(file({ kind: AttachmentKind.RAW_DATA, sha256: RAW }))
      .expect(409);

    expect(refused.body.detail).toContain('already pointed at');
  });

  it('finds the same content wherever else it was filed', async () => {
    const second = await calibrations.certificate(
      await register.multimeter('SG-130002'),
      { number: 'CAL-FIX-0002' },
    );

    await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file({ kind: AttachmentKind.RAW_DATA, sha256: RAW, storageKey: 'raw/a.csv' }))
      .expect(201);
    await http()
      .post(`/api/certificates/${second.id}/attachments`)
      .send(file({ kind: AttachmentKind.RAW_DATA, sha256: RAW, storageKey: 'raw/b.csv' }))
      .expect(201);

    const shared = await harness.app
      .get(
        (await import('@registry/calibration/attachment.service')).AttachmentService,
      )
      .byChecksum(RAW);

    expect(shared).toHaveLength(2);
  });

  it('refuses a checksum that is not one, at the edge', async () => {
    await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file({ sha256: 'nope' }))
      .expect(400);
  });

  it('refuses a size that is not a positive whole number', async () => {
    await http()
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file({ byteSize: 0 }))
      .expect(400);
  });

  it('reports an unknown certificate rather than filing against nothing', async () => {
    await http().post('/api/certificates/999999/attachments').send(file()).expect(404);
    await http().get('/api/certificates/999999/attachments').expect(404);
  });

  it('writes who attached what to the audit trail', async () => {
    await http().post(`/api/certificates/${certificateId}/attachments`).send(file()).expect(201);

    const trail = await harness.dataSource
      .getRepository(AuditEvent)
      .find({ where: { action: 'certificate.attach' } });

    expect(trail).toHaveLength(1);
    expect(trail[0]?.detail).toContain('CERTIFICATE_SCAN');
  });

  it('lets a technician attach and an auditor only look', async () => {
    await harness
      .api(harness.tokenFor(Role.AUDITOR))
      .post(`/api/certificates/${certificateId}/attachments`)
      .send(file())
      .expect(403);

    await harness
      .api(harness.tokenFor(Role.AUDITOR))
      .get(`/api/certificates/${certificateId}/attachments`)
      .expect(200);
  });
});
