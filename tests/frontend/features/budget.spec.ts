import {
  Component,
  coverageFactor,
  combinedStandard,
  contributions,
  degreesOfFreedom,
  distributionLabel,
  divisorFor,
  effectiveDegreesOfFreedom,
  emptyComponent,
  expanded,
  managedGuardBand,
  ratioVerdict,
  standardUncertainty,
  studentT,
  testUncertaintyRatio,
} from '@features/uncertainty/budget.model';

function spec(label: string, halfWidth: number, distribution: Component['distribution'] = 'NORMAL'): Component {
  return { ...emptyComponent(label), distribution, halfWidth, sensitivity: 1 };
}

function repeats(label: string, deviation: number, observations: number): Component {
  return {
    ...emptyComponent(label),
    distribution: 'NORMAL',
    halfWidth: deviation,
    sensitivity: 1,
    observations,
  };
}

describe('single components', () => {
  it('divides a rectangular half width by root three', () => {
    expect(standardUncertainty(spec('resolution', 0.0005, 'RECTANGULAR'))).toBeCloseTo(
      0.0005 / Math.sqrt(3),
      12,
    );
  });

  it('knows the divisor for each shape', () => {
    expect(divisorFor('NORMAL')).toBe(1);
    expect(divisorFor('RECTANGULAR')).toBeCloseTo(Math.sqrt(3), 12);
    expect(divisorFor('TRIANGULAR')).toBeCloseTo(Math.sqrt(6), 12);
    expect(divisorFor('U_SHAPED')).toBeCloseTo(Math.sqrt(2), 12);
  });

  it('scales by the sensitivity and ignores its sign', () => {
    const opposing = { ...spec('thermal', 2), sensitivity: -0.0000115 };

    expect(standardUncertainty(opposing)).toBeCloseTo(2 * 0.0000115, 15);
  });

  it('treats an empty half width as contributing nothing', () => {
    expect(standardUncertainty(emptyComponent('blank'))).toBe(0);
  });

  it('divides repeat observations by root n rather than by a shape divisor', () => {
    expect(standardUncertainty(repeats('repeatability', 0.012, 9))).toBeCloseTo(0.004, 12);
  });

  it('gives a specification infinite degrees of freedom', () => {
    expect(degreesOfFreedom(spec('standard', 0.001))).toBe(Number.POSITIVE_INFINITY);
    expect(degreesOfFreedom(repeats('repeatability', 0.01, 9))).toBe(8);
  });

  it('has a readable label for each distribution', () => {
    expect(distributionLabel('RECTANGULAR')).toContain('stated limit');
    expect(distributionLabel('U_SHAPED')).toContain('cyclic');
  });
});

describe('combining a budget', () => {
  it('combines by root sum square, not by addition', () => {
    expect(combinedStandard([spec('a', 3), spec('b', 4)])).toBeCloseTo(5, 12);
  });

  it('gives an empty budget a combined uncertainty of zero', () => {
    expect(combinedStandard([])).toBe(0);
    expect(expanded([])).toBe(0);
  });

  it('takes the asymptotic factor when everything is a specification', () => {
    const budget = [spec('standard', 0.001), spec('resolution', 0.0005, 'RECTANGULAR')];

    expect(effectiveDegreesOfFreedom(budget)).toBe(Number.POSITIVE_INFINITY);
    expect(coverageFactor(budget)).toBe(2);
  });

  it('needs a factor well above two when a short repeat run dominates', () => {
    const budget = [repeats('repeatability', 0.01, 3), spec('resolution', 0.0001, 'RECTANGULAR')];

    expect(effectiveDegreesOfFreedom(budget)).toBeCloseTo(2, 0);
    expect(coverageFactor(budget)).toBeGreaterThan(4);
  });

  it('comes back towards two as the run gets longer', () => {
    const shortRun = coverageFactor([repeats('repeatability', 0.01, 3)]);
    const longRun = coverageFactor([repeats('repeatability', 0.01, 40)]);

    expect(longRun).toBeLessThan(shortRun);
    expect(longRun).toBeCloseTo(2.09, 1);
  });

  it('interpolates the student t table rather than stepping', () => {
    expect(studentT(7)).toBeGreaterThan(studentT(8));
    expect(studentT(7)).toBeLessThan(studentT(6));
    expect(studentT(1)).toBe(13.97);
    expect(studentT(Number.POSITIVE_INFINITY)).toBe(2);
  });

  it('ranks the components by the share of variance each owns', () => {
    const ranked = contributions([spec('small', 0.0001), spec('large', 0.003), spec('mid', 0.001)]);

    expect(ranked.map((entry) => entry.component.label)).toEqual(['large', 'mid', 'small']);
    expect(ranked[0].share).toBeGreaterThan(0.8);
    expect(ranked.reduce((total, entry) => total + entry.share, 0)).toBeCloseTo(1, 9);
  });

  it('reports zero shares for an empty budget rather than dividing by nothing', () => {
    expect(contributions([spec('blank', 0)])[0].share).toBe(0);
  });
});

describe('the ratio and the guard band', () => {
  const budget = [spec('standard', 0.001)];

  it('is the tolerance half width over the expanded uncertainty', () => {
    expect(testUncertaintyRatio(budget, 0.004)).toBeCloseTo(2, 9);
  });

  it('reports nothing at all without a tolerance to compare against', () => {
    expect(testUncertaintyRatio(budget, null)).toBeNull();
    expect(testUncertaintyRatio(budget, 0)).toBeNull();
    expect(ratioVerdict(null)).toBeNull();
  });

  it('is unbounded when the budget is empty', () => {
    expect(testUncertaintyRatio([], 0.004)).toBe(Number.POSITIVE_INFINITY);
  });

  it('calls four or better healthy and under one unstatable', () => {
    expect(ratioVerdict(8)).toBe('healthy');
    expect(ratioVerdict(4)).toBe('healthy');
    expect(ratioVerdict(3.9)).toBe('guarded');
    expect(ratioVerdict(0.9)).toBe('unstatable');
  });

  it('needs no guard band once the ratio reaches the target', () => {
    expect(managedGuardBand([spec('standard', 0.00025)], 0.004)).toBe(0);
  });

  it('grows the guard band as the ratio falls', () => {
    const atTwo = managedGuardBand([spec('standard', 0.001)], 0.004);
    const atOne = managedGuardBand([spec('standard', 0.002)], 0.004);

    expect(atTwo).toBeCloseTo(0.001, 9);
    expect(atOne).toBeCloseTo(0.003, 9);
    expect(atOne).toBeGreaterThan(atTwo);
  });

  it('never guard bands more than the expanded uncertainty', () => {
    const wide = managedGuardBand([spec('standard', 0.01)], 0.004);

    expect(wide).toBeLessThanOrEqual(expanded([spec('standard', 0.01)]));
  });
});
