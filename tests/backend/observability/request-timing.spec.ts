import type { Request } from 'express';

import { routeOf } from '@registry/observability/request-timing.interceptor';

function request(overrides: Partial<Request> & Record<string, unknown>): Request {
  return { method: 'GET', baseUrl: '', ...overrides } as unknown as Request;
}

describe('the label a timed request gets', () => {
  it('uses the route template rather than the url that was asked for', () => {
    const label = routeOf(
      request({ method: 'get', baseUrl: '/api/instruments', route: { path: '/:id' } }),
    );

    expect(label).toBe('GET /api/instruments/:id');
  });

  it('does not double the slash on a route mounted at its own root', () => {
    expect(routeOf(request({ baseUrl: '/api/recalls', route: { path: '/' } }))).toBe(
      'GET /api/recalls',
    );
  });

  it('keeps the method apart, so a read and a write are two series', () => {
    const read = routeOf(request({ method: 'GET', baseUrl: '/api/usage', route: { path: '/' } }));
    const write = routeOf(request({ method: 'POST', baseUrl: '/api/usage', route: { path: '/' } }));

    expect(read).not.toBe(write);
  });

  it('labels an unmatched request as unmatched rather than by its url', () => {
    const label = routeOf(request({ method: 'GET', baseUrl: '/api/whatever/4417' }));

    expect(label).toBe('GET unmatched');
    expect(label).not.toContain('4417');
  });

  it('never lets an asset tag into the label', () => {
    const label = routeOf(
      request({ baseUrl: '/api/instruments/by-tag', route: { path: '/:assetTag' } }),
    );

    expect(label).toBe('GET /api/instruments/by-tag/:assetTag');
    expect(label).not.toContain('SG-');
  });

  it('handles a route mounted at the application root', () => {
    expect(routeOf(request({ baseUrl: '', route: { path: '/health' } }))).toBe('GET /health');
  });

  it('falls back to GET when the request carries no method', () => {
    expect(routeOf(request({ method: undefined, route: { path: '/metrics' } }))).toBe(
      'GET /metrics',
    );
  });
});
