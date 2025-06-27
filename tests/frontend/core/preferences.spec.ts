import {
  DEFAULTS,
  Preferences,
  densityClass,
  isDefault,
  sanitise,
  themeAttribute,
} from '@core/preferences/preferences.model';

describe('reading stored preferences', () => {
  it('falls back to the defaults for anything that is not an object', () => {
    expect(sanitise(null)).toEqual(DEFAULTS);
    expect(sanitise('dark')).toEqual(DEFAULTS);
    expect(sanitise(42)).toEqual(DEFAULTS);
  });

  it('keeps a value it recognises', () => {
    expect(sanitise({ theme: 'dark' }).theme).toBe('dark');
    expect(sanitise({ density: 'compact' }).density).toBe('compact');
  });

  it('drops a theme that no longer exists', () => {
    expect(sanitise({ theme: 'sepia' }).theme).toBe('system');
  });

  it('only accepts a page size the console actually offers', () => {
    expect(sanitise({ pageSize: 100 }).pageSize).toBe(100);
    expect(sanitise({ pageSize: 37 }).pageSize).toBe(50);
    expect(sanitise({ pageSize: '100' }).pageSize).toBe(50);
  });

  it('only accepts a horizon from the list', () => {
    expect(sanitise({ recallHorizonDays: 90 }).recallHorizonDays).toBe(90);
    expect(sanitise({ recallHorizonDays: 11 }).recallHorizonDays).toBe(60);
  });

  it('clamps the bench hours rather than refusing them', () => {
    expect(sanitise({ capacityHours: 0 }).capacityHours).toBe(1);
    expect(sanitise({ capacityHours: 5000 }).capacityHours).toBe(200);
    expect(sanitise({ capacityHours: 32.6 }).capacityHours).toBe(33);
    expect(sanitise({ capacityHours: Number.NaN }).capacityHours).toBe(24);
  });

  it('will not take a string where a flag belongs', () => {
    expect(sanitise({ hideRetired: 'yes' }).hideRetired).toBe(true);
    expect(sanitise({ hideRetired: false }).hideRetired).toBe(false);
  });

  it('fills the gaps in a partly written object', () => {
    expect(sanitise({ theme: 'light' })).toEqual({ ...DEFAULTS, theme: 'light' });
  });

  it('ignores fields it does not know about', () => {
    const cleaned = sanitise({ theme: 'dark', somethingElse: true }) as Record<string, unknown>;

    expect(cleaned['somethingElse']).toBeUndefined();
  });
});

describe('describing preferences', () => {
  it('knows when nothing has been changed', () => {
    expect(isDefault(DEFAULTS)).toBe(true);
    expect(isDefault({ ...DEFAULTS, theme: 'dark' } as Preferences)).toBe(false);
  });

  it('stamps nothing on the document when the theme follows the system', () => {
    expect(themeAttribute('system')).toBeNull();
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('light')).toBe('light');
  });

  it('only adds a class for the compact density', () => {
    expect(densityClass('comfortable')).toBe('');
    expect(densityClass('compact')).toBe('sg-compact');
  });
});
