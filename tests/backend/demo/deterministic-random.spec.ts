import {
  DeterministicRandom,
  plusDays,
  plusYears,
} from '@registry/demo/deterministic-random';

describe('the deterministic generator', () => {
  it('gives the same run twice from the same seed', () => {
    const first = new DeterministicRandom(20_250_113);
    const second = new DeterministicRandom(20_250_113);

    const a = Array.from({ length: 20 }, () => first.next());
    const b = Array.from({ length: 20 }, () => second.next());

    expect(a).toEqual(b);
  });

  it('gives a different run from a different seed', () => {
    const first = new DeterministicRandom(1);
    const second = new DeterministicRandom(2);

    expect(first.next()).not.toBe(second.next());
  });

  it('stays inside the unit interval', () => {
    const random = new DeterministicRandom(7);

    for (let i = 0; i < 500; i++) {
      const value = random.next();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads across the whole range rather than sitting in one corner', () => {
    const random = new DeterministicRandom(99);
    const buckets = [0, 0, 0, 0];

    for (let i = 0; i < 1000; i++) {
      buckets[Math.floor(random.next() * 4)] += 1;
    }
    expect(Math.min(...buckets)).toBeGreaterThan(150);
  });

  it('bounds a whole number below the bound it was given', () => {
    const random = new DeterministicRandom(3);

    for (let i = 0; i < 200; i++) {
      const value = random.nextInt(5);

      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
  });

  it('refuses a bound that is not a positive whole number', () => {
    const random = new DeterministicRandom(3);

    expect(() => random.nextInt(0)).toThrow('positive whole number');
    expect(() => random.nextInt(2.5)).toThrow('positive whole number');
  });

  it('picks an entry that is actually in the list', () => {
    const random = new DeterministicRandom(11);
    const items = ['a', 'b', 'c'];

    for (let i = 0; i < 50; i++) {
      expect(items).toContain(random.pick(items));
    }
  });

  it('refuses to pick from nothing', () => {
    expect(() => new DeterministicRandom(1).pick([])).toThrow('nothing to pick from');
  });
});

describe('the date helpers the demo lays its history out with', () => {
  it('adds days across a month boundary', () => {
    expect(plusDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(plusDays('2024-02-28', 2)).toBe('2024-03-01');
  });

  it('goes backwards when the count is negative', () => {
    expect(plusDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  it('adds whole years and keeps the day', () => {
    expect(plusYears('2023-02-06', 2)).toBe('2025-02-06');
    expect(plusYears('2023-02-06', 0)).toBe('2023-02-06');
  });

  it('rolls the twenty ninth of february onto the first of march', () => {
    expect(plusYears('2024-02-29', 1)).toBe('2025-03-01');
  });
});
