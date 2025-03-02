import {
  Distribution,
  UncertaintyBudget,
  UncertaintyComponent,
} from '@registry/calibration/uncertainty';

function spec(label: string, shape: Distribution, halfWidth: number): UncertaintyComponent {
  return UncertaintyComponent.typeB(label, 'maker specification', shape, halfWidth);
}

describe('an uncertainty budget', () => {
  it('divides a rectangular half width by root three', () => {
    const resolution = spec('resolution', Distribution.RECTANGULAR, 0.0005);

    expect(resolution.standardUncertainty()).toBeCloseTo(0.0005 / Math.sqrt(3), 12);
  });

  it('divides a triangular half width by root six and a u shaped one by root two', () => {
    expect(spec('pair', Distribution.TRIANGULAR, 0.006).standardUncertainty()).toBeCloseTo(
      0.006 / Math.sqrt(6),
      12,
    );
    expect(spec('hum', Distribution.U_SHAPED, 0.006).standardUncertainty()).toBeCloseTo(
      0.006 / Math.sqrt(2),
      12,
    );
  });

  it('scales a contribution into the output unit with the sensitivity', () => {
    const thermal = new UncertaintyComponent(
      'thermal expansion',
      'coefficient',
      Distribution.RECTANGULAR,
      2,
      0.0000115,
      Number.POSITIVE_INFINITY,
    );

    expect(thermal.standardUncertainty()).toBeCloseTo((2 / Math.sqrt(3)) * 0.0000115, 15);
  });

  it('keeps a negative sensitivity contributing a positive uncertainty', () => {
    const opposing = new UncertaintyComponent(
      'opposing term',
      'model',
      Distribution.NORMAL,
      0.004,
      -1,
      Number.POSITIVE_INFINITY,
    );

    expect(opposing.standardUncertainty()).toBeCloseTo(0.004, 15);
  });

  it('combines components by root sum square rather than by addition', () => {
    const budget = UncertaintyBudget.of(
      spec('a', Distribution.NORMAL, 3),
      spec('b', Distribution.NORMAL, 4),
    );

    expect(budget.combinedStandard()).toBeCloseTo(5, 12);
  });

  it('gives a budget of only specifications infinite degrees of freedom', () => {
    const budget = UncertaintyBudget.of(
      spec('standard', Distribution.NORMAL, 0.001),
      spec('resolution', Distribution.RECTANGULAR, 0.0005),
    );

    expect(budget.effectiveDegreesOfFreedom()).toBe(Number.POSITIVE_INFINITY);
    expect(budget.coverageFactor()).toBe(2);
  });

  it('needs a factor well above two when a short repeat run dominates', () => {
    const budget = UncertaintyBudget.of(
      UncertaintyComponent.typeA('repeatability', 0.01, 3),
      spec('resolution', Distribution.RECTANGULAR, 0.0001),
    );

    expect(budget.effectiveDegreesOfFreedom()).toBeGreaterThan(1.8);
    expect(budget.effectiveDegreesOfFreedom()).toBeLessThan(2.2);
    expect(budget.coverageFactor()).toBeGreaterThan(4);
  });

  it('pulls the coverage factor back towards two as observations pile up', () => {
    const shortRun = UncertaintyBudget.of(UncertaintyComponent.typeA('repeatability', 0.01, 3));
    const longRun = UncertaintyBudget.of(UncertaintyComponent.typeA('repeatability', 0.01, 40));

    expect(longRun.coverageFactor()).toBeLessThan(shortRun.coverageFactor());
    expect(longRun.coverageFactor()).toBeCloseTo(2.09, 1);
  });

  it('divides a type A deviation by root n and drops one degree of freedom', () => {
    const repeat = UncertaintyComponent.typeA('repeatability', 0.012, 9);

    expect(repeat.standardUncertainty()).toBeCloseTo(0.004, 12);
    expect(repeat.degreesOfFreedom).toBe(8);
  });

  it('refuses a type A evaluation of a single observation', () => {
    expect(() => UncertaintyComponent.typeA('repeatability', 0.01, 1)).toThrow(
      'at least two observations',
    );
  });

  it('expands by the factor it worked out, and by one supplied instead', () => {
    const budget = UncertaintyBudget.of(spec('standard', Distribution.NORMAL, 0.0012));

    expect(budget.expanded()).toBeCloseTo(0.0024, 12);
    expect(budget.expandedAt(3)).toBeCloseTo(0.0036, 12);
  });

  it('refuses a coverage factor that is not positive', () => {
    const budget = UncertaintyBudget.of(spec('a', Distribution.NORMAL, 1));

    expect(() => budget.expandedAt(0)).toThrow('must be positive');
    expect(() => budget.expandedAt(-2)).toThrow('must be positive');
  });

  it('reports an empty budget as zero rather than dividing by zero', () => {
    const budget = UncertaintyBudget.from([]);

    expect(budget.isEmpty()).toBe(true);
    expect(budget.combinedStandard()).toBe(0);
    expect(budget.effectiveDegreesOfFreedom()).toBe(Number.POSITIVE_INFINITY);
    expect(budget.expanded()).toBe(0);
    expect(budget.varianceShares().size).toBe(0);
  });

  it('names the component owning most of the variance first', () => {
    const budget = UncertaintyBudget.of(
      spec('small', Distribution.NORMAL, 0.0001),
      spec('large', Distribution.NORMAL, 0.003),
      spec('middle', Distribution.NORMAL, 0.001),
    );

    expect(budget.dominantFirst().map((line) => line.label)).toEqual(['large', 'middle', 'small']);
  });

  it('splits the variance into shares that add up to one', () => {
    const budget = UncertaintyBudget.of(
      spec('a', Distribution.NORMAL, 3),
      spec('b', Distribution.NORMAL, 4),
    );
    const shares = budget.varianceShares();

    expect(shares.get('a')).toBeCloseTo(9 / 25, 12);
    expect(shares.get('b')).toBeCloseTo(16 / 25, 12);
    expect([...shares.values()].reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 12);
  });

  it('sums the shares of two lines entered under the same label', () => {
    const budget = UncertaintyBudget.of(
      spec('drift', Distribution.NORMAL, 3),
      spec('drift', Distribution.NORMAL, 4),
    );

    expect(budget.varianceShares().size).toBe(1);
    expect(budget.varianceShares().get('drift')).toBeCloseTo(1, 12);
  });

  it('leaves the original budget untouched when a component is added', () => {
    const original = UncertaintyBudget.of(spec('a', Distribution.NORMAL, 3));
    const extended = original.plus(spec('b', Distribution.NORMAL, 4));

    expect(original.components()).toHaveLength(1);
    expect(extended.components()).toHaveLength(2);
    expect(extended.combinedStandard()).toBeCloseTo(5, 12);
  });

  it('refuses a negative half width at construction', () => {
    expect(() => spec('bad', Distribution.NORMAL, -0.001)).toThrow('negative half width');
  });

  it('refuses degrees of freedom that are not positive', () => {
    expect(
      () => new UncertaintyComponent('bad', 'model', Distribution.NORMAL, 0.001, 1, 0),
    ).toThrow('positive degrees of freedom');
  });

  it('rescales a line without disturbing the one it came from', () => {
    const original = spec('thermal', Distribution.RECTANGULAR, 2);
    const scaled = original.withSensitivity(0.0000115);

    expect(original.sensitivity).toBe(1);
    expect(scaled.standardUncertainty()).toBeCloseTo(original.standardUncertainty() * 0.0000115, 15);
  });
});
