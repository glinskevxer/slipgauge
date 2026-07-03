import {
  accessLine,
  isQuiet,
  isWorthLogging,
  levelFor,
  toAccessLine,
} from '@registry/observability/access-log';

describe('which requests get a line', () => {
  it('drops a read that worked', () => {
    expect(isWorthLogging('GET', 'GET /api/instruments', 200)).toBe(false);
    expect(isWorthLogging('HEAD', 'HEAD /api/instruments', 200)).toBe(false);
  });

  it('keeps a read that failed', () => {
    expect(isWorthLogging('GET', 'GET /api/instruments/:tag', 404)).toBe(true);
    expect(isWorthLogging('GET', 'GET /api/instruments', 500)).toBe(true);
  });

  it('keeps everything that changed something', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isWorthLogging(method, `${method} /api/certificates`, 201)).toBe(true);
    }
  });

  it('never keeps a health probe or a metrics scrape', () => {
    expect(isQuiet('GET', 'GET /health')).toBe(true);
    expect(isQuiet('GET', 'GET /metrics')).toBe(true);
    expect(isWorthLogging('GET', 'GET /health', 503)).toBe(false);
  });

  it('does not mistake a route that merely mentions health', () => {
    expect(isQuiet('GET', 'GET /api/instruments/health')).toBe(false);
  });
});

describe('the level a status deserves', () => {
  it('reads a refusal as a warning and a fault as an error', () => {
    expect(levelFor(200)).toBe('info');
    expect(levelFor(201)).toBe('info');
    expect(levelFor(404)).toBe('warn');
    expect(levelFor(422)).toBe('warn');
    expect(levelFor(500)).toBe('error');
    expect(levelFor(503)).toBe('error');
  });
});

describe('the line itself', () => {
  const at = new Date('2025-11-20T09:00:00.000Z');

  it('carries the route rather than the url', () => {
    const line = toAccessLine('post', 'POST /api/certificates', 201, 12.4, 'r.okonjo', 'abc', undefined, at);

    expect(line).toEqual({
      at: '2025-11-20T09:00:00.000Z',
      method: 'POST',
      route: 'POST /api/certificates',
      status: 201,
      ms: 12,
      actor: 'r.okonjo',
      correlation: 'abc',
    });
  });

  it('carries the registry code when the request was refused for a reason', () => {
    const line = toAccessLine(
      'POST',
      'POST /api/certificates',
      422,
      9,
      'r.okonjo',
      'abc',
      'registry/rule-violation',
      at,
    );

    expect(line.code).toBe('registry/rule-violation');
  });

  it('leaves the code out entirely when there is none', () => {
    const line = toAccessLine('GET', 'GET /api/x', 200, 1, null, null, undefined, at);

    expect(Object.keys(line)).not.toContain('code');
  });

  it('says so plainly when nobody was signed in', () => {
    const line = toAccessLine('POST', 'POST /api/auth/sign-in', 401, 40, null, 'abc', undefined, at);

    expect(line.actor).toBeNull();
  });

  it('is one line of json with the keys in a fixed order', () => {
    const text = accessLine(
      toAccessLine('POST', 'POST /api/x', 201, 5, 'a', 'b', undefined, at),
    );

    expect(text).not.toContain('\n');
    expect(text.indexOf('"method"')).toBeLessThan(text.indexOf('"route"'));
    expect(text.indexOf('"route"')).toBeLessThan(text.indexOf('"status"'));
  });

  it('never carries a body, a query string or a header', () => {
    const text = accessLine(
      toAccessLine('POST', 'POST /api/auth/sign-in', 401, 5, null, 'b', undefined, at),
    );

    for (const forbidden of ['password', 'authorization', 'body', 'query', 'token']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('rounds the milliseconds, because a log is not a stopwatch', () => {
    expect(toAccessLine('GET', 'r', 200, 12.6, null, null, undefined, at).ms).toBe(13);
  });
});
