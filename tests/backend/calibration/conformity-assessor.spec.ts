import {
  AcceptancePolicy,
  ConformityAssessor,
  ToleranceBand,
  Verdict,
  worseOf,
  worstOf,
} from '@registry/calibration/conformity';

/** Nominal 20, tolerance plus or minus 0.004, which is the micrometer spec. */
function band(): ToleranceBand {
  return ToleranceBand.symmetric(20, 0.004);
}

describe('a tolerance band', () => {
  it('includes both of its limits', () => {
    expect(band().contains(19.996)).toBe(true);
    expect(band().contains(20.004)).toBe(true);
    expect(band().contains(20.0041)).toBe(false);
  });

  it('reports zero excursion inside and the overshoot outside', () => {
    expect(band().excursion(20)).toBe(0);
    expect(band().excursion(20.009)).toBeCloseTo(0.005, 9);
    expect(band().excursion(19.99)).toBeCloseTo(0.006, 9);
  });

  it('pulls both limits towards the middle when it shrinks', () => {
    const guarded = band().shrunkBy(0.001);

    expect(guarded.low).toBeCloseTo(19.997, 9);
    expect(guarded.high).toBeCloseTo(20.003, 9);
    expect(guarded.nominal).toBe(20);
  });

  it('collapses to a point rather than inverting when shrunk past the middle', () => {
    const collapsed = band().shrunkBy(0.05);

    expect(collapsed.low).toBe(collapsed.high);
    expect(collapsed.width()).toBe(0);
    expect(collapsed.isPoint()).toBe(true);
    expect(collapsed.contains(20)).toBe(true);
  });

  it('refuses a negative guard band because it would widen the limit', () => {
    expect(() => band().shrunkBy(-0.001)).toThrow('cannot widen the tolerance');
  });

  it('refuses an inverted band at construction', () => {
    expect(() => new ToleranceBand(0, 1, -1)).toThrow('sits above high');
  });

  it('refuses a negative half width', () => {
    expect(() => ToleranceBand.symmetric(20, -0.001)).toThrow('cannot be negative');
  });
});

describe('a verdict', () => {
  it('puts an instrument back in service only on a pass or a marginal result', () => {
    const serviceable = [Verdict.PASS, Verdict.MARGINAL];

    for (const verdict of Object.values(Verdict)) {
      expect(worseOf(verdict, Verdict.PASS)).toBe(verdict);
      expect(serviceable.includes(verdict)).toBe(
        verdict === Verdict.PASS || verdict === Verdict.MARGINAL,
      );
    }
  });

  it('takes the worse of two verdicts in both directions', () => {
    expect(worseOf(Verdict.PASS, Verdict.MARGINAL)).toBe(Verdict.MARGINAL);
    expect(worseOf(Verdict.MARGINAL, Verdict.PASS)).toBe(Verdict.MARGINAL);
    expect(worseOf(Verdict.INDETERMINATE, Verdict.OUT_OF_TOLERANCE)).toBe(
      Verdict.OUT_OF_TOLERANCE,
    );
    expect(worseOf(Verdict.NOT_ASSESSED, Verdict.PASS)).toBe(Verdict.NOT_ASSESSED);
  });

  it('ranks an unassessed point above a clean pass and below a marginal one', () => {
    expect(worseOf(Verdict.NOT_ASSESSED, Verdict.PASS)).toBe(Verdict.NOT_ASSESSED);
    expect(worseOf(Verdict.NOT_ASSESSED, Verdict.MARGINAL)).toBe(Verdict.MARGINAL);
  });

  it('collapses a run of points to the worst of them', () => {
    expect(worstOf([Verdict.PASS, Verdict.MARGINAL, Verdict.PASS])).toBe(Verdict.MARGINAL);
    expect(worstOf([Verdict.PASS, Verdict.OUT_OF_TOLERANCE, Verdict.INDETERMINATE])).toBe(
      Verdict.OUT_OF_TOLERANCE,
    );
    expect(worstOf([])).toBe(Verdict.NOT_ASSESSED);
  });
});

describe('the conformity assessor', () => {
  const assessor = new ConformityAssessor();

  function judge(measured: number, expandedU: number, policy: AcceptancePolicy) {
    return assessor.assess(measured, band(), expandedU, policy);
  }

  it('fails a reading outside the tolerance whatever the policy is', () => {
    for (const policy of Object.values(AcceptancePolicy)) {
      const decision = judge(20.0051, 0.0002, policy);

      expect(decision.verdict).toBe(Verdict.OUT_OF_TOLERANCE);
      expect(decision.excursion).toBeCloseTo(0.0011, 9);
    }
  });

  it('needs no guard band at a healthy ratio under the managed policy', () => {
    const decision = judge(20.0039, 0.0005, AcceptancePolicy.MANAGED_RISK);

    expect(decision.testRatio).toBeCloseTo(8, 9);
    expect(decision.guardBand).toBe(0);
    expect(decision.guarded()).toBe(false);
    expect(decision.verdict).toBe(Verdict.PASS);
  });

  it('grows the managed guard band as the ratio falls below the target', () => {
    const decision = assessor.assess(20, band(), 0.002, AcceptancePolicy.MANAGED_RISK);

    expect(decision.testRatio).toBeCloseTo(2, 9);
    expect(decision.guardBand).toBeCloseTo(0.001, 12);
    expect(decision.acceptance.low).toBeCloseTo(19.997, 9);
    expect(decision.acceptance.high).toBeCloseTo(20.003, 9);
  });

  it('calls a reading inside tolerance but outside the guard band marginal', () => {
    const decision = judge(20.0035, 0.002, AcceptancePolicy.MANAGED_RISK);

    expect(decision.verdict).toBe(Verdict.MARGINAL);
    expect(decision.excursion).toBe(0);
    expect(decision.guarded()).toBe(true);
  });

  it('passes the same reading on shared risk and calls it marginal on stringent', () => {
    expect(judge(20.0035, 0.002, AcceptancePolicy.SHARED_RISK).verdict).toBe(Verdict.PASS);
    expect(judge(20.0035, 0.002, AcceptancePolicy.STRINGENT).verdict).toBe(Verdict.MARGINAL);
  });

  it('flags a shared risk pass within one uncertainty of the limit', () => {
    expect(judge(20.0035, 0.002, AcceptancePolicy.SHARED_RISK).passedOnSharedRisk()).toBe(true);
    expect(judge(20, 0.002, AcceptancePolicy.SHARED_RISK).passedOnSharedRisk()).toBe(false);
  });

  it('leaves conformity unstatable below a ratio of one, well inside tolerance or not', () => {
    const decision = judge(20, 0.006, AcceptancePolicy.MANAGED_RISK);

    expect(decision.testRatio).toBeLessThan(1);
    expect(decision.verdict).toBe(Verdict.INDETERMINATE);
    expect(decision.unstatable()).toBe(true);
  });

  it('lets an out of tolerance reading beat an unstatable ratio', () => {
    expect(judge(20.02, 0.006, AcceptancePolicy.MANAGED_RISK).verdict).toBe(
      Verdict.OUT_OF_TOLERANCE,
    );
  });

  it('makes the stringent guard band the whole expanded uncertainty', () => {
    const decision = judge(20, 0.0005, AcceptancePolicy.STRINGENT);

    expect(decision.guardBand).toBeCloseTo(0.0005, 12);
    expect(decision.acceptance.halfWidth()).toBeCloseTo(0.0035, 9);
  });

  it('reports a missing reading as not assessed rather than failed', () => {
    const decision = assessor.assess(null, band(), 0.001, AcceptancePolicy.MANAGED_RISK);

    expect(decision.verdict).toBe(Verdict.NOT_ASSESSED);
    expect(decision.measured).toBeNull();
    expect(decision.testRatio).toBeNaN();
  });

  it('reports an infinite ratio for a certificate carrying no budget at all', () => {
    const decision = judge(20.0039, 0, AcceptancePolicy.MANAGED_RISK);

    expect(decision.testRatio).toBe(Number.POSITIVE_INFINITY);
    expect(decision.guardBand).toBe(0);
    expect(decision.verdict).toBe(Verdict.PASS);
  });

  it('reports a ratio of zero for a collapsed tolerance instead of dividing by it', () => {
    expect(assessor.testUncertaintyRatio(ToleranceBand.symmetric(5, 0), 0.01)).toBe(0);
  });

  it('refuses a negative expanded uncertainty', () => {
    expect(() => judge(20, -0.001, AcceptancePolicy.MANAGED_RISK)).toThrow('zero or more');
  });

  it('never grows the guard band past the expanded uncertainty', () => {
    expect(judge(20, 0.0039, AcceptancePolicy.MANAGED_RISK).guardBand).toBeLessThanOrEqual(0.0039);
  });
});
