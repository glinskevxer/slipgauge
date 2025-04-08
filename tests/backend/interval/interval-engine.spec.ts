import { ConfigService } from '@nestjs/config';

import {
  CalibrationCertificate,
  calibrationCertificate,
} from '@registry/calibration/calibration-certificate.entity';
import { ToleranceBand, Verdict } from '@registry/calibration/conformity';
import { measurementPoint } from '@registry/calibration/measurement-point.entity';
import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentClass } from '@registry/instrument/instrument-class.entity';
import { Criticality, Discipline } from '@registry/instrument/instrument.enums';
import {
  DEFAULT_INTERVAL_POLICY,
  IntervalBasis,
  IntervalEngine,
  IntervalPolicy,
  stepFor,
  validatePolicy,
} from '@registry/interval';

function engineWith(overrides: Partial<IntervalPolicy> = {}): IntervalEngine {
  const policy = { ...DEFAULT_INTERVAL_POLICY, ...overrides };

  return new IntervalEngine({ getOrThrow: () => policy } as unknown as ConfigService);
}

function instrument(
  criticality = Criticality.IMPORTANT,
  base = 365,
  min = 180,
  max = 730,
): Instrument {
  const type = new InstrumentClass();

  type.id = 1;
  type.code = 'MIC-EXT';
  type.name = 'External micrometer';
  type.discipline = Discipline.DIMENSIONAL;
  type.criticality = criticality;
  type.applyIntervals(base, min, max);

  const item = new Instrument();

  item.id = 1;
  item.assetTag = 'SG-000001';
  item.unit = 'mm';
  item.instrumentClass = type;
  item.applySpan(0, 25, 0.001);
  return item;
}

let sequence = 0;

/** A certificate whose as found verdict and drift are both dictated. */
function visit(verdict: Verdict, driftFraction = 0.1): CalibrationCertificate {
  sequence += 1;

  const certificate = calibrationCertificate(
    `CAL-${String(sequence).padStart(4, '0')}`,
    instrument(),
    '2025-02-11',
    '2025-02-11',
    'R Okonjo',
    'Slipgauge Metrology',
  );

  const halfWidth = 0.004;
  const point = measurementPoint(1, 20, 'mm', ToleranceBand.symmetric(20, halfWidth), 0.0005);

  point.recordAsFound(20 + driftFraction * halfWidth, verdict);
  point.recordAsLeft(20 + driftFraction * halfWidth, verdict);
  certificate.addPoint(point);
  certificate.asFoundVerdict = verdict;
  certificate.asLeftVerdict = verdict;
  return certificate;
}

describe('the interval policy', () => {
  it('weights an extension step by how much the instrument matters', () => {
    expect(stepFor(DEFAULT_INTERVAL_POLICY, Criticality.ROUTINE, 365)).toBeGreaterThan(
      stepFor(DEFAULT_INTERVAL_POLICY, Criticality.CRITICAL, 365),
    );
  });

  it('refuses a policy number outside the range the procedure allows', () => {
    expect(() => validatePolicy({ ...DEFAULT_INTERVAL_POLICY, failureFactor: 0 })).toThrow(
      'failureFactor',
    );
    expect(() => validatePolicy({ ...DEFAULT_INTERVAL_POLICY, passesBeforeExtension: 0 })).toThrow(
      'passesBeforeExtension',
    );
    expect(() => validatePolicy({ ...DEFAULT_INTERVAL_POLICY, driftBrake: 2 })).toThrow(
      'driftBrake',
    );
  });
});

describe('the interval engine', () => {
  it('runs a brand new instrument at the class base interval', () => {
    const outcome = engineWith().decide(instrument(), []);

    expect(outcome.intervalDays).toBe(365);
    expect(outcome.basis).toBe(IntervalBasis.BASE);
    expect(outcome.consecutivePasses).toBe(0);
    expect(outcome.driftRatio).toBeNull();
  });

  it('holds the interval until the run of clean results is long enough', () => {
    const outcome = engineWith().decide(instrument(), [visit(Verdict.PASS)]);

    expect(outcome.intervalDays).toBe(365);
    expect(outcome.basis).toBe(IntervalBasis.HELD);
    expect(outcome.rationale).toContain('2 needed before the interval moves');
  });

  it('extends once the run reaches the number the procedure asks for', () => {
    const outcome = engineWith().decide(instrument(), [
      visit(Verdict.PASS),
      visit(Verdict.PASS),
    ]);

    expect(outcome.basis).toBe(IntervalBasis.EXTENDED);
    expect(outcome.intervalDays).toBeGreaterThan(365);
    expect(outcome.consecutivePasses).toBe(2);
  });

  it('withholds the extension when the same passing results are drifting', () => {
    const outcome = engineWith().decide(instrument(), [
      visit(Verdict.PASS, 0.9),
      visit(Verdict.PASS, 0.9),
    ]);

    expect(outcome.basis).toBe(IntervalBasis.HELD);
    expect(outcome.intervalDays).toBe(365);
    expect(outcome.rationale).toContain('90 percent of tolerance');
  });

  it('cuts the interval on an out of tolerance result', () => {
    const outcome = engineWith().decide(instrument(), [visit(Verdict.OUT_OF_TOLERANCE)]);

    expect(outcome.basis).toBe(IntervalBasis.SHORTENED);
    expect(outcome.intervalDays).toBe(183);
    expect(outcome.rationale).toContain('interval cut from 365 to 183');
  });

  it('stops the cut at the floor the class allows', () => {
    const outcome = engineWith().decide(instrument(Criticality.IMPORTANT, 365, 300, 730), [
      visit(Verdict.OUT_OF_TOLERANCE),
    ]);

    expect(outcome.basis).toBe(IntervalBasis.FLOORED);
    expect(outcome.intervalDays).toBe(300);
  });

  it('stops the extension at the ceiling the class allows', () => {
    const history = Array.from({ length: 12 }, () => visit(Verdict.PASS));
    const outcome = engineWith().decide(instrument(Criticality.ROUTINE, 365, 180, 420), history);

    expect(outcome.intervalDays).toBe(420);
    expect(outcome.basis).toBe(IntervalBasis.CAPPED);
  });

  it('resets the run of clean results after any failure', () => {
    const outcome = engineWith().decide(instrument(), [
      visit(Verdict.PASS),
      visit(Verdict.OUT_OF_TOLERANCE),
      visit(Verdict.PASS),
    ]);

    expect(outcome.consecutivePasses).toBe(1);
    expect(outcome.basis).toBe(IntervalBasis.HELD);
  });

  it('treats a marginal result as a hold rather than a pass or a failure', () => {
    const engine = engineWith();

    const ending = engine.decide(instrument(), [visit(Verdict.PASS), visit(Verdict.MARGINAL)]);

    expect(ending.intervalDays).toBe(365);
    expect(ending.consecutivePasses).toBe(0);
    expect(ending.rationale).toContain('as found marginal');

    // The run restarts behind it, so one later pass is not enough to extend.
    const after = engine.decide(instrument(), [
      visit(Verdict.PASS),
      visit(Verdict.MARGINAL),
      visit(Verdict.PASS),
    ]);

    expect(after.intervalDays).toBe(365);
    expect(after.consecutivePasses).toBe(1);
  });

  it('treats an unstatable result the same way as a marginal one', () => {
    const outcome = engineWith().decide(instrument(), [
      visit(Verdict.PASS),
      visit(Verdict.PASS),
      visit(Verdict.INDETERMINATE),
    ]);

    expect(outcome.consecutivePasses).toBe(0);
    expect(outcome.basis).toBe(IntervalBasis.HELD);
  });

  it('replays the whole history, so removing a failure changes what follows it', () => {
    const clean = [visit(Verdict.PASS), visit(Verdict.PASS), visit(Verdict.PASS)];
    const withFailure = [clean[0] as CalibrationCertificate, visit(Verdict.OUT_OF_TOLERANCE)].concat(
      clean.slice(1) as CalibrationCertificate[],
    );

    const engine = engineWith();

    expect(engine.decide(instrument(), clean).intervalDays).toBeGreaterThan(365);
    expect(engine.decide(instrument(), withFailure).intervalDays).toBeLessThan(365);
  });

  it('reads the drift brake and the failure factor from the policy', () => {
    const lenient = engineWith({ driftBrake: 0.95, failureFactor: 0.9 });

    expect(
      lenient.decide(instrument(), [visit(Verdict.PASS, 0.9), visit(Verdict.PASS, 0.9)]).basis,
    ).toBe(IntervalBasis.EXTENDED);
    expect(lenient.decide(instrument(), [visit(Verdict.OUT_OF_TOLERANCE)]).intervalDays).toBe(329);
  });

  it('skips a point with no reading rather than counting it as no drift', () => {
    const certificate = visit(Verdict.PASS, 0.9);
    const blank = measurementPoint(2, 5, 'mm', ToleranceBand.symmetric(5, 0.004), 0.0005);

    certificate.addPoint(blank);

    expect(engineWith().worstDriftOn(certificate)).toBeCloseTo(0.9, 6);
  });

  it('reports no drift at all when nothing on the sheet was read', () => {
    const certificate = visit(Verdict.NOT_ASSESSED);
    (certificate.points[0] as { asFound: number | null }).asFound = null;

    expect(engineWith().worstDriftOn(certificate)).toBeNull();
  });
});
