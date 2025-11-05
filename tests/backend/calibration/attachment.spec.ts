import {
  AttachmentKind,
  MAX_ATTACHMENT_BYTES,
  certificateAttachment,
} from '@registry/calibration/certificate-attachment.entity';
import {
  CalibrationCertificate,
  calibrationCertificate,
} from '@registry/calibration/calibration-certificate.entity';
import { Instrument } from '@registry/instrument/instrument.entity';

const CHECKSUM = 'a'.repeat(64);

function certificate(): CalibrationCertificate {
  const instrument = new Instrument();

  instrument.id = 42;
  instrument.assetTag = 'SG-000042';
  instrument.unit = 'mm';

  return calibrationCertificate(
    'CAL-2025-0100',
    instrument,
    '2025-02-11',
    '2025-02-14',
    'R Okonjo',
    'Slipgauge Metrology',
  );
}

function attachment() {
  return certificateAttachment(
    certificate(),
    AttachmentKind.CERTIFICATE_SCAN,
    'CAL-2025-0100.pdf',
    'application/pdf',
    240_000,
    CHECKSUM,
    'certificates/2025/CAL-2025-0100.pdf',
    'r.okonjo',
  );
}

describe('an attachment', () => {
  it('holds a pointer and a checksum rather than the bytes', () => {
    const file = attachment();

    expect(file.storageKey).toBe('certificates/2025/CAL-2025-0100.pdf');
    expect(file.sha256).toBe(CHECKSUM);
    expect(Object.keys(file)).not.toContain('bytes');
  });

  it('knows when it is the certificate itself rather than something beside it', () => {
    expect(attachment().isTheCertificate()).toBe(true);

    const raw = certificateAttachment(
      certificate(),
      AttachmentKind.RAW_DATA,
      'run.csv',
      'text/csv',
      900,
      CHECKSUM,
      'raw/2025/run.csv',
      'r.okonjo',
    );

    expect(raw.isTheCertificate()).toBe(false);
  });

  it('describes its size the way a person would', () => {
    const sizes = [900, 9_000, 9_000_000];
    const described = sizes.map((size) =>
      certificateAttachment(
        certificate(),
        AttachmentKind.RAW_DATA,
        'f',
        'text/csv',
        size,
        CHECKSUM,
        'raw/f',
        'r.okonjo',
      ).describeSize(),
    );

    expect(described).toEqual(['900 B', '8.8 kB', '8.6 MB']);
  });

  it('quotes the first eight characters of the checksum', () => {
    expect(attachment().shortChecksum()).toBe('aaaaaaaa');
  });

  it('trims a filename rather than letting it run past the column', () => {
    const long = certificateAttachment(
      certificate(),
      AttachmentKind.PHOTOGRAPH,
      `${'x'.repeat(400)}.jpg`,
      'image/jpeg',
      1_000,
      CHECKSUM,
      'photos/x.jpg',
      'r.okonjo',
    );

    expect(long.filename).toHaveLength(200);
  });

  it('refuses a file with no size, or a negative one', () => {
    for (const size of [0, -1, 1.5]) {
      expect(() =>
        certificateAttachment(
          certificate(),
          AttachmentKind.RAW_DATA,
          'f',
          'text/csv',
          size,
          CHECKSUM,
          'raw/f',
          'r.okonjo',
        ),
      ).toThrow('has to have a size');
    }
  });

  it('refuses a file the document store will not take', () => {
    expect(() =>
      certificateAttachment(
        certificate(),
        AttachmentKind.RAW_DATA,
        'f',
        'text/csv',
        MAX_ATTACHMENT_BYTES + 1,
        CHECKSUM,
        'raw/f',
        'r.okonjo',
      ),
    ).toThrow('will not take a file over');
  });

  it('refuses a checksum that is not one', () => {
    for (const bad of ['', 'A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}z`]) {
      expect(() =>
        certificateAttachment(
          certificate(),
          AttachmentKind.RAW_DATA,
          'f',
          'text/csv',
          10,
          bad,
          'raw/f',
          'r.okonjo',
        ),
      ).toThrow('sixty four lower case hex characters');
    }
  });

  it('refuses a storage key that would escape the store', () => {
    for (const bad of ['', '/etc/passwd', '../secrets', 'a b']) {
      expect(() =>
        certificateAttachment(
          certificate(),
          AttachmentKind.RAW_DATA,
          'f',
          'text/csv',
          10,
          CHECKSUM,
          bad,
          'r.okonjo',
        ),
      ).toThrow('not a usable storage key');
    }
  });
});
