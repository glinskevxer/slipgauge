import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

/**
 * jsdom has no layout engine, so anything that measures an element comes back
 * as zero. The drift chart and the capacity board both size themselves from
 * their host, and a zero width makes them render nothing at all. Give them a
 * believable box so their specs assert on real geometry.
 */
Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  writable: true,
  value: jest.fn(() => ({
    width: 960,
    height: 320,
    top: 0,
    left: 0,
    right: 960,
    bottom: 320,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })),
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
