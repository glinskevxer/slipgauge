import {
  RATE_WINDOW_MS,
  RouteCost,
  allowanceFor,
  costOf,
  isRead,
  limiterKey,
  retryAfterSeconds,
} from '@registry/observability/rate-limit';

describe('which requests are counted at all', () => {
  it('never counts a read', () => {
    expect(isRead('GET')).toBe(true);
    expect(isRead('head')).toBe(true);
    expect(isRead('OPTIONS')).toBe(true);
    expect(costOf('GET', '/api/certificates')).toBeNull();
    expect(costOf('HEAD', '/api/instruments')).toBeNull();
  });

  it('counts every write', () => {
    expect(isRead('POST')).toBe(false);
    expect(costOf('POST', '/api/usage')).not.toBeNull();
    expect(costOf('PATCH', '/api/customers/ACME')).not.toBeNull();
    expect(costOf('DELETE', '/api/anything')).not.toBeNull();
  });
});

describe('what a route costs', () => {
  it('reads a logger upload and a bulk withdrawal as sweeping', () => {
    expect(costOf('POST', '/api/environment/readings')).toBe(RouteCost.SWEEPING);
    expect(costOf('POST', '/api/environment/excursions/41/withdrawals')).toBe(
      RouteCost.SWEEPING,
    );
    expect(costOf('POST', '/api/instruments/import')).toBe(RouteCost.SWEEPING);
    expect(costOf('POST', '/api/recalls/instruments/12/reassessment')).toBe(RouteCost.SWEEPING);
  });

  it('reads filing and signing a certificate as heavy', () => {
    expect(costOf('POST', '/api/certificates')).toBe(RouteCost.HEAVY);
    expect(costOf('POST', '/api/certificates/12/approval')).toBe(RouteCost.HEAVY);
    expect(costOf('POST', '/api/certificates/12/withdrawal')).toBe(RouteCost.HEAVY);
  });

  it('reads contract review and a proficiency score as heavy', () => {
    expect(costOf('POST', '/api/jobs/J-2025-0142/review')).toBe(RouteCost.HEAVY);
    expect(costOf('POST', '/api/jobs/J-2025-0142/complete')).toBe(RouteCost.HEAVY);
    expect(costOf('POST', '/api/proficiency/ILC-1/score')).toBe(RouteCost.HEAVY);
  });

  it('reads everything else as light', () => {
    expect(costOf('POST', '/api/jobs')).toBe(RouteCost.LIGHT);
    expect(costOf('POST', '/api/usage')).toBe(RouteCost.LIGHT);
    expect(costOf('POST', '/api/nonconformities')).toBe(RouteCost.LIGHT);
  });

  it('does not read a listing under a heavy path as heavy', () => {
    expect(costOf('GET', '/api/certificates/12/approval')).toBeNull();
  });

  it('does not mistake a job reference for a certificate route', () => {
    expect(costOf('POST', '/api/jobs/J-2025-0142/items')).toBe(RouteCost.LIGHT);
    expect(costOf('POST', '/api/jobs/J-2025-0142/promise')).toBe(RouteCost.LIGHT);
  });
});

describe('the allowances', () => {
  it('gives the expensive routes far less room than the cheap ones', () => {
    expect(allowanceFor(RouteCost.LIGHT)).toBeGreaterThan(allowanceFor(RouteCost.HEAVY));
    expect(allowanceFor(RouteCost.HEAVY)).toBeGreaterThan(allowanceFor(RouteCost.SWEEPING));
  });

  it('leaves enough room for a busy bench on the light routes', () => {
    expect(allowanceFor(RouteCost.LIGHT)).toBeGreaterThanOrEqual(60);
  });
});

describe('the key a caller is counted under', () => {
  it('separates the costs, so a heavy limit does not stop a light request', () => {
    expect(limiterKey(RouteCost.HEAVY, 'r.okonjo')).not.toBe(
      limiterKey(RouteCost.LIGHT, 'r.okonjo'),
    );
  });

  it('separates the people, so one busy bench does not stop the others', () => {
    expect(limiterKey(RouteCost.HEAVY, 'r.okonjo')).not.toBe(
      limiterKey(RouteCost.HEAVY, 'a.pereira'),
    );
  });
});

describe('how long to wait', () => {
  it('counts to the end of the window the oldest hit sits in', () => {
    const now = 1_000_000;

    expect(retryAfterSeconds(now, now)).toBe(RATE_WINDOW_MS / 1000);
    expect(retryAfterSeconds(now - 30_000, now)).toBe(30);
  });

  it('is never zero, because a client reads that as try again now', () => {
    const now = 1_000_000;

    expect(retryAfterSeconds(now - RATE_WINDOW_MS, now)).toBe(1);
    expect(retryAfterSeconds(now - RATE_WINDOW_MS * 5, now)).toBe(1);
  });

  it('rounds a part second up', () => {
    const now = 1_000_000;

    expect(retryAfterSeconds(now - 59_500, now)).toBe(1);
    expect(retryAfterSeconds(now - 58_200, now)).toBe(2);
  });
});
