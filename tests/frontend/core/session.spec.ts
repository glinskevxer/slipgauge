import {
  Session,
  TokenPair,
  expiryOf,
  hasAnyRole,
  isExpiring,
  roleLabel,
  sessionFrom,
} from '@core/auth/session.model';

function tokenExpiringAt(seconds: number): string {
  const payload = btoa(JSON.stringify({ sub: 'h.whitcombe', exp: seconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}

function pair(token: string): TokenPair {
  return {
    accessToken: token,
    refreshToken: 'refresh',
    username: 'h.whitcombe',
    displayName: 'Helen Whitcombe',
    roles: ['METROLOGIST', 'QUALITY_MANAGER'],
  };
}

describe('session model', () => {
  it('reads the expiry out of a token and turns it into milliseconds', () => {
    expect(expiryOf(tokenExpiringAt(1_735_000_000))).toBe(1_735_000_000_000);
  });

  it('treats an unreadable token as already expired rather than throwing', () => {
    expect(expiryOf('not-a-token')).toBe(0);
    expect(expiryOf('a.b.c')).toBe(0);
    expect(expiryOf('')).toBe(0);
  });

  it('builds a session with the expiry the token carries', () => {
    const session = sessionFrom(pair(tokenExpiringAt(2_000_000_000)));

    expect(session.username).toBe('h.whitcombe');
    expect(session.expiresAt).toBe(2_000_000_000_000);
    expect(session.roles).toEqual(['METROLOGIST', 'QUALITY_MANAGER']);
  });

  it('calls a session expiring a minute before it actually does', () => {
    const session: Session = sessionFrom(pair(tokenExpiringAt(1_000)));
    const expiresAt = session.expiresAt;

    expect(isExpiring(session, expiresAt - 120_000)).toBe(false);
    expect(isExpiring(session, expiresAt - 30_000)).toBe(true);
    expect(isExpiring(session, expiresAt + 1)).toBe(true);
  });

  it('answers role questions against whatever the session holds', () => {
    const session = sessionFrom(pair(tokenExpiringAt(2_000_000_000)));

    expect(hasAnyRole(session, 'METROLOGIST')).toBe(true);
    expect(hasAnyRole(session, 'ADMIN')).toBe(false);
    expect(hasAnyRole(session, 'ADMIN', 'QUALITY_MANAGER')).toBe(true);
    expect(hasAnyRole(null, 'METROLOGIST')).toBe(false);
  });

  it('has a readable label for every role', () => {
    expect(roleLabel('QUALITY_MANAGER')).toBe('Quality manager');
    expect(roleLabel('TECHNICIAN')).toBe('Technician');
  });
});
