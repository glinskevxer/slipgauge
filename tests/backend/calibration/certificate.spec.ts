import {
  CalibrationCertificate,
  calibrationCertificate,
} from '@registry/calibration/calibration-certificate.entity';
import { ToleranceBand, Verdict } from '@registry/calibration/conformity';
import { measurementPoint } from '@registry/calibration/measurement-point.entity';
import { Instrument } from '@registry/instrument/instrument.entity';

function instrument(assetTag = 'SG-000042'): Instrument {
  const item = new Instrument();

  item.id = 42;
  item.assetTag = assetTag;
  item.unit = 'mm';
  item.applySpan(0, 25, 0.001);
  return item;
}

function certificate(): CalibrationCertificate {
  return calibrationCertificate(
    'CAL-2025-0100',
    instrument(),
    '2025-02-11',
    '2025-02-14',
    'R Okonjo',
    'Slipgauge Metrology',
  );
}

function point(sequence: number, nominal: number) {
  return measurementPoint(sequence, nominal, 'mm', ToleranceBand.symmetric(nominal, 0.004), 0.0005);
}

describe('a measurement point', () => {
  it('rebuilds the band it was judged against from its own limits', () => {
    const band = point(1, 20).tolerance();

    expect(band.low).toBeCloseTo(19.996, 9);
    expect(band.high).toBeCloseTo(20.004, 9);
    expect(band.nominal).toBe(20);
  });

  it('reports the error as the signed difference from the nominal', () => {
    const measured = point(1, 20);
    measured.recordAsFound(20.0021, Verdict.PASS);
    measured.recordAsLeft(19.9995, Verdict.PASS);

    expect(measured.asFoundError()).toBeCloseTo(0.0021, 9);
    expect(measured.asLeftError()).toBeCloseTo(-0.0005, 9);
  });

  it('leaves the error null when nothing was measured', () => {
    const untouched = point(1, 20);

    expect(untouched.asFoundError()).toBeNull();
    expect(untouched.normalisedAsFoundError()).toBeNull();
  });

  it('normalises the error against the half width so points share an axis', () => {
    const measured = point(1, 20);
    measured.recordAsFound(20.002, Verdict.PASS);

    expect(measured.normalisedAsFoundError()).toBeCloseTo(0.5, 9);
  });

  it('reports no normalised error when the band has collapsed to a point', () => {
    const exact = measurementPoint(1, 20, 'mm', ToleranceBand.symmetric(20, 0), 0.0005);
    exact.recordAsFound(20.002, Verdict.OUT_OF_TOLERANCE);

    expect(exact.normalisedAsFoundError()).toBeNull();
  });

  it('knows whether the bench actually moved the instrument', () => {
    const adjusted = point(1, 20);
    adjusted.recordAsFound(20.0051, Verdict.OUT_OF_TOLERANCE);
    adjusted.recordAsLeft(20.0002, Verdict.PASS);

    const untouched = point(2, 15);
    untouched.recordAsFound(15.0001, Verdict.PASS);
    untouched.recordAsLeft(15.0001, Verdict.PASS);

    expect(adjusted.wasAdjusted()).toBe(true);
    expect(untouched.wasAdjusted()).toBe(false);
  });

  it('refuses a coverage factor that is not positive', () => {
    expect(() => point(1, 20).setCoverageFactor(0)).toThrow('must be positive');
  });
});

describe('a calibration certificate', () => {
  it('refuses to be issued before the work was done', () => {
    expect(() =>
      calibrationCertificate(
        'CAL-2025-0101',
        instrument(),
        '2025-02-11',
        '2025-02-10',
        'R Okonjo',
        'Slipgauge Metrology',
      ),
    ).toThrow('cannot be issued before');
  });

  it('takes the worst of its points for each of the two roll ups', () => {
    const record = certificate();

    const first = point(1, 5);
    first.recordAsFound(5.0001, Verdict.PASS);
    first.recordAsLeft(5.0001, Verdict.PASS);

    const second = point(2, 20);
    second.recordAsFound(20.0051, Verdict.OUT_OF_TOLERANCE);
    second.recordAsLeft(20.0002, Verdict.MARGINAL);

    record.addPoint(first);
    record.addPoint(second);
    record.rollUpVerdicts();

    expect(record.asFoundVerdict).toBe(Verdict.OUT_OF_TOLERANCE);
    expect(record.asLeftVerdict).toBe(Verdict.MARGINAL);
  });

  it('refuses to roll up a certificate carrying no points', () => {
    expect(() => certificate().rollUpVerdicts()).toThrow('carries no measurement points');
  });

  it('returns its points in the order the technician worked through them', () => {
    const record = certificate();
    record.addPoint(point(3, 25));
    record.addPoint(point(1, 5));
    record.addPoint(point(2, 20));

    expect(record.orderedPoints().map((each) => each.sequenceNo)).toEqual([1, 2, 3]);
  });

  it('speaks for the instrument until it is withdrawn or superseded', () => {
    const record = certificate();
    expect(record.isLive()).toBe(true);

    record.withdraw('issued against the wrong asset', new Date('2025-03-01T09:00:00Z'));

    expect(record.isLive()).toBe(false);
    expect(record.isWithdrawn()).toBe(true);
    expect(record.withdrawnReason).toBe('issued against the wrong asset');
  });

  it('refuses a withdrawal with no reason, and a second one', () => {
    const record = certificate();

    expect(() => record.withdraw('   ', new Date())).toThrow('needs a reason');

    record.withdraw('superseded by a recalibration', new Date());

    expect(() => record.withdraw('again', new Date())).toThrow('already withdrawn');
  });

  it('stops speaking for the instrument once something supersedes it', () => {
    const record = certificate();
    const replacement = certificate();

    record.supersede(replacement);

    expect(record.isLive()).toBe(false);
    expect(record.isWithdrawn()).toBe(false);
  });

  it('refuses to let a certificate supersede itself', () => {
    const record = certificate();

    expect(() => record.supersede(record)).toThrow('cannot supersede itself');
  });

  it('will not let the technician who did the work approve it', () => {
    const record = certificate();

    expect(() => record.approve('R Okonjo')).toThrow('cannot approve it');
    expect(() => record.approve('')).toThrow('an approver is required');

    record.approve('D Ferreira');

    expect(record.approvedBy).toBe('D Ferreira');
  });

  it('keeps the ambient conditions the work was done under', () => {
    const record = certificate();
    record.recordAmbient(20.1, 44.5);

    expect(record.ambientTemperature).toBe(20.1);
    expect(record.ambientHumidity).toBe(44.5);
  });
});
