import { calibrationCertificate } from '@registry/calibration/calibration-certificate.entity';
import { Instrument } from '@registry/instrument/instrument.entity';
import {
  ChainDefectKind,
  ChainReport,
  StandardRole,
  carriesTraceability,
  chainDefect,
  externalStandard,
  internalStandard,
} from '@registry/traceability';

function instrument(assetTag: string): Instrument {
  const item = new Instrument();

  item.id = Number(assetTag.replace('SG-', ''));
  item.assetTag = assetTag;
  item.unit = 'mm';
  return item;
}

function certificate() {
  return calibrationCertificate(
    'CAL-2025-0100',
    instrument('SG-000042'),
    '2025-02-11',
    '2025-02-14',
    'R Okonjo',
    'Slipgauge Metrology',
  );
}

describe('the role a standard played', () => {
  it('carries traceability only when it was the reference', () => {
    expect(carriesTraceability(StandardRole.REFERENCE)).toBe(true);
    expect(carriesTraceability(StandardRole.CHECK)).toBe(false);
    expect(carriesTraceability(StandardRole.ENVIRONMENT)).toBe(false);
  });
});

describe('a chain edge', () => {
  it('points either inward at an instrument or outward at a reference', () => {
    const inward = internalStandard(certificate(), instrument('SG-000007'), StandardRole.REFERENCE);
    const outward = externalStandard(
      certificate(),
      'NPL 2024/117',
      'National Physical Laboratory',
      'NPL-2024-117',
      StandardRole.REFERENCE,
    );

    expect(inward.isInternal()).toBe(true);
    expect(inward.externalRef).toBeNull();
    expect(outward.isInternal()).toBe(false);
    expect(outward.standard).toBeNull();
  });

  it('describes itself by asset tag inward and by reference outward', () => {
    expect(
      internalStandard(certificate(), instrument('SG-000007'), StandardRole.REFERENCE).describe(),
    ).toBe('SG-000007');

    expect(
      externalStandard(
        certificate(),
        'NPL 2024/117',
        'National Physical Laboratory',
        null,
        StandardRole.REFERENCE,
      ).describe(),
    ).toBe('NPL 2024/117 (National Physical Laboratory)');

    expect(
      externalStandard(certificate(), 'NPL 2024/117', null, null, StandardRole.REFERENCE).describe(),
    ).toBe('NPL 2024/117');
  });

  it('refuses an outside standard with no reference at all', () => {
    expect(() =>
      externalStandard(certificate(), '  ', 'A Lab', null, StandardRole.REFERENCE),
    ).toThrow('needs a reference');
  });

  it('holds a date inside the quoted window and rejects one outside it', () => {
    const edge = externalStandard(
      certificate(),
      'NPL 2024/117',
      'National Physical Laboratory',
      null,
      StandardRole.REFERENCE,
    ).validFor('2024-11-01', '2025-10-31', 'UKAS 0001');

    expect(edge.externallyValidOn('2024-11-01')).toBe(true);
    expect(edge.externallyValidOn('2025-10-31')).toBe(true);
    expect(edge.externallyValidOn('2024-10-31')).toBe(false);
    expect(edge.externallyValidOn('2025-11-01')).toBe(false);
    expect(edge.isAccredited()).toBe(true);
  });

  it('treats an open ended window as covering everything after it starts', () => {
    const edge = externalStandard(
      certificate(),
      'PTB 2023/44',
      'PTB',
      null,
      StandardRole.REFERENCE,
    ).validFor('2023-01-01', null, null);

    expect(edge.externallyValidOn('2099-01-01')).toBe(true);
    expect(edge.externallyValidOn('2022-12-31')).toBe(false);
    expect(edge.isAccredited()).toBe(false);
  });

  it('never reports an inward edge as externally valid', () => {
    const inward = internalStandard(certificate(), instrument('SG-000007'), StandardRole.REFERENCE);

    expect(inward.externallyValidOn('2025-02-11')).toBe(false);
  });

  it('refuses a validity window that runs backwards', () => {
    const edge = externalStandard(certificate(), 'NPL 2024/117', 'NPL', null, StandardRole.CHECK);

    expect(() => edge.validFor('2025-10-31', '2024-11-01', null)).toThrow('runs backwards');
  });
});

describe('a chain report', () => {
  it('summarises a sound chain by the number of hops', () => {
    expect(ChainReport.sound(1, true).summarise()).toBe('traceable in 1 hop');
    expect(ChainReport.sound(3, true).summarise()).toBe('traceable in 3 hops');
  });

  it('says so when a sound chain never reaches an outside laboratory', () => {
    expect(ChainReport.sound(2, false).summarise()).toContain('no branch reaches an outside lab');
  });

  it('counts the problems on a broken chain', () => {
    const broken = ChainReport.broken(1, false, [
      chainDefect.missingReference(),
      chainDefect.circular('SG-000042'),
    ]);

    expect(broken.summarise()).toBe('2 problems on the chain');
    expect(broken.hasDefect(ChainDefectKind.CIRCULAR)).toBe(true);
    expect(broken.hasDefect(ChainDefectKind.STANDARD_OVERDUE)).toBe(false);
    expect(broken.firstDefect()?.kind).toBe(ChainDefectKind.NO_REFERENCE);
  });

  it('has no first defect when nothing is wrong', () => {
    expect(ChainReport.sound(1, true).firstDefect()).toBeNull();
  });

  it('writes a defect a technician can act on', () => {
    expect(chainDefect.overdue('SG-000007', '2025-01-31', '2025-02-11').detail).toBe(
      'SG-000007 was due on 2025-01-31 and was used on 2025-02-11',
    );
    expect(chainDefect.notServiceable('SG-000007', 'OUT_OF_TOLERANCE').detail).toContain(
      'was left OUT_OF_TOLERANCE',
    );
    expect(chainDefect.noCertificate('SG-000007', '2025-02-11').detail).toContain('covers');
  });
});
