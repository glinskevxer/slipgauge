import { ToleranceKind } from '@registry/calibration/conformity';
import { ToleranceProfile, toleranceProfile } from '@registry/calibration/tolerance-profile.entity';

function profile(
  kind: ToleranceKind,
  absolute: number,
  readingPpm: number,
  spanPpm: number,
  floor: number,
): ToleranceProfile {
  return toleranceProfile('T', 'test', kind).withTerms(absolute, readingPpm, spanPpm, floor);
}

describe('a tolerance profile', () => {
  it('ignores where on the scale you are when the terms are absolute', () => {
    const micrometer = profile(ToleranceKind.ABSOLUTE, 0.004, 0, 0, 0);

    const atZero = micrometer.bandAt(0, 25);
    const atTwenty = micrometer.bandAt(20, 25);

    expect(atZero.halfWidth()).toBeCloseTo(0.004, 9);
    expect(atTwenty.halfWidth()).toBeCloseTo(0.004, 9);
    expect(atTwenty.low).toBeCloseTo(19.996, 9);
    expect(atTwenty.high).toBeCloseTo(20.004, 9);
  });

  it('scales a reading profile with the nominal value', () => {
    const resistor = profile(ToleranceKind.PERCENT_OF_READING, 0, 2, 0, 0);

    expect(resistor.bandAt(10000, null).halfWidth()).toBeCloseTo(0.02, 9);
    expect(resistor.bandAt(1000, null).halfWidth()).toBeCloseTo(0.002, 9);
  });

  it('uses the magnitude of the nominal so a bipolar scale still works', () => {
    const meter = profile(ToleranceKind.PERCENT_OF_READING, 0, 35, 0, 0);

    const negative = meter.bandAt(-10, null).halfWidth();
    const positive = meter.bandAt(10, null).halfWidth();

    expect(negative).toBe(positive);
    expect(negative).toBeCloseTo(0.00035, 12);
  });

  it('keeps a span profile flat across the range but tied to the instrument', () => {
    const pressure = profile(ToleranceKind.PERCENT_OF_SPAN, 0, 0, 250, 0);

    expect(pressure.bandAt(3, 40).halfWidth()).toBeCloseTo(0.01, 9);
    expect(pressure.bandAt(38, 40).halfWidth()).toBeCloseTo(0.01, 9);
    expect(pressure.bandAt(3, 400).halfWidth()).toBeCloseTo(0.1, 9);
  });

  it('falls back to zero for a span profile when no span is known', () => {
    const pressure = profile(ToleranceKind.PERCENT_OF_SPAN, 0, 0, 250, 0);

    expect(pressure.bandAt(3, null).halfWidth()).toBe(0);
  });

  it('sums all three terms on a combined profile', () => {
    const balance = profile(ToleranceKind.COMBINED, 0.0001, 20, 0, 0);

    expect(balance.bandAt(100, 220).halfWidth()).toBeCloseTo(0.0021, 12);
  });

  it('widens a band the floor would otherwise let collapse near zero', () => {
    const balance = profile(ToleranceKind.COMBINED, 0, 20, 0, 0.00005);

    expect(balance.bandAt(0, 220).halfWidth()).toBeCloseTo(0.00005, 12);
  });

  it('never narrows a band that is already wider than the floor', () => {
    const balance = profile(ToleranceKind.COMBINED, 0.01, 0, 0, 0.00005);

    expect(balance.bandAt(50, 220).halfWidth()).toBeCloseTo(0.01, 9);
  });

  it('refuses a negative term when the profile is built', () => {
    expect(() => profile(ToleranceKind.ABSOLUTE, -1, 0, 0, 0)).toThrow(
      'absolute term cannot be negative',
    );
    expect(() => profile(ToleranceKind.ABSOLUTE, 0, 0, 0, -1)).toThrow(
      'floor term cannot be negative',
    );
  });

  it('knows which kinds do not move with the reading', () => {
    expect(profile(ToleranceKind.ABSOLUTE, 0.004, 0, 0, 0).isFlat()).toBe(true);
    expect(profile(ToleranceKind.PERCENT_OF_SPAN, 0, 0, 250, 0).isFlat()).toBe(true);
    expect(profile(ToleranceKind.PERCENT_OF_READING, 0, 2, 0, 0).isFlat()).toBe(false);
    expect(profile(ToleranceKind.COMBINED, 0.0001, 20, 0, 0).isFlat()).toBe(false);
  });

  it('describes itself the way the certificate prints it', () => {
    expect(profile(ToleranceKind.ABSOLUTE, 0.004, 0, 0, 0).describe('mm')).toBe('0.004 mm');
    expect(profile(ToleranceKind.PERCENT_OF_READING, 0, 2, 0, 0).describe('ohm')).toBe(
      '2 ppm of reading',
    );
    expect(profile(ToleranceKind.COMBINED, 0.0001, 20, 5, 0.00005).describe('g')).toBe(
      '0.0001 g plus 20 ppm of reading plus 5 ppm of span, floor 0.00005 g',
    );
  });
});
