export type Role = 'TECHNICIAN' | 'METROLOGIST' | 'QUALITY_MANAGER' | 'AUDITOR' | 'ADMIN';

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly username: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
}

export interface Session {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly username: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
  readonly expiresAt: number;
}

/**
 * Reads the expiry out of a JWT without verifying it. The console never trusts
 * this for a decision, only for knowing when to refresh; the service is the
 * only thing that validates a signature.
 */
export function expiryOf(accessToken: string): number {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return 0;
  }
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function sessionFrom(pair: TokenPair): Session {
  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    username: pair.username,
    displayName: pair.displayName,
    roles: pair.roles,
    expiresAt: expiryOf(pair.accessToken),
  };
}

/** True with a minute to spare, so a call does not start on a token about to die. */
export function isExpiring(session: Session, now = Date.now()): boolean {
  return session.expiresAt - now < 60_000;
}

export function hasAnyRole(session: Session | null, ...wanted: readonly Role[]): boolean {
  if (!session) {
    return false;
  }
  return wanted.some((role) => session.roles.includes(role));
}

const ROLE_LABELS: Readonly<Record<Role, string>> = {
  TECHNICIAN: 'Technician',
  METROLOGIST: 'Metrologist',
  QUALITY_MANAGER: 'Quality manager',
  AUDITOR: 'Auditor',
  ADMIN: 'Administrator',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}
