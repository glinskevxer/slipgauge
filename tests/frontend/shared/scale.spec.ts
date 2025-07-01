import { extent, linearScale, niceTicks, padDomain } from '@shared/charts/scale';

describe('linear scale', () => {
  const scale = linearScale([0, 10], [0, 100]);

  it('maps the ends of the domain onto the ends of the range', () => {
    expect(scale(0)).toBe(0);
    expect(scale(10)).toBe(100);
    expect(scale(5)).toBe(50);
  });

  it('extrapolates past the domain rather than clamping', () => {
    expect(scale(-1)).toBe(-10);
    expect(scale(12)).toBe(120);
  });

  it('handles an inverted range, which is what a y axis needs', () => {
    const y = linearScale([0, 1], [200, 0]);

    expect(y(0)).toBe(200);
    expect(y(1)).toBe(0);
    expect(y(0.5)).toBe(100);
  });

  it('collapses to the middle of the range when the domain has no width', () => {
    const flat = linearScale([7, 7], [0, 100]);

    expect(flat(7)).toBe(50);
    expect(flat(9)).toBe(50);
  });

  it('inverts a pixel back to a value', () => {
    expect(scale.invert(50)).toBe(5);
    expect(scale.invert(0)).toBe(0);
  });
});

describe('nice ticks', () => {
  it('chooses round steps a person would have picked', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('covers a domain that does not start on a step', () => {
    expect(niceTicks(-1.2, 1.2, 4)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });

  it('returns the single value when the domain has no width', () => {
    expect(niceTicks(3, 3, 5)).toEqual([3]);
  });

  it('refuses a nonsensical request rather than looping', () => {
    expect(niceTicks(0, 10, 0)).toEqual([]);
    expect(niceTicks(Number.NaN, 10, 5)).toEqual([]);
  });

  it('does not accumulate floating point drift across the axis', () => {
    const ticks = niceTicks(0, 1, 10);

    expect(ticks).toContain(0.3);
    expect(ticks).toContain(0.7);
    expect(ticks[ticks.length - 1]).toBe(1);
  });
});

describe('domain helpers', () => {
  it('pads a domain on both sides', () => {
    expect(padDomain([0, 10], 0.1)).toEqual([-1, 11]);
  });

  it('gives a zero width domain something to breathe in', () => {
    expect(padDomain([5, 5], 0.1)).toEqual([4.5, 5.5]);
    expect(padDomain([0, 0], 0.1)).toEqual([-1, 1]);
  });

  it('finds the extent of a series and reports nothing for an empty one', () => {
    expect(extent([3, -1, 7, 2])).toEqual([-1, 7]);
    expect(extent([])).toBeNull();
  });
});
