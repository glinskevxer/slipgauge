import {
  AppUser,
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
} from '@registry/security/app-user.entity';
import { AuditOutcome, auditEvent } from '@registry/security/audit-event.entity';
import { ALL_ROLES, Role, expandRoles, hasAnyRole, isRole } from '@registry/security/role';

const NOW = new Date('2025-06-10T09:00:00Z');

function user(...roles: Role[]): AppUser {
  const account = new AppUser();

  account.id = 1;
  account.username = 'r.okonjo';
  account.displayName = 'R Okonjo';
  account.email = 'r.okonjo@slipgauge.internal';
  account.passwordHash = 'hash-of-something';
  account.enabled = true;
  account.lockedUntil = null;
  account.failedAttempts = 0;
  account.passwordSetAt = NOW;
  account.lastLoginAt = null;
  account.roles = roles.length > 0 ? roles : [Role.TECHNICIAN];
  return account;
}

describe('what a role lets somebody do', () => {
  it('lists every role the laboratory recognises', () => {
    expect(ALL_ROLES).toHaveLength(5);
    expect(isRole('METROLOGIST')).toBe(true);
    expect(isRole('SUPERUSER')).toBe(false);
  });

  it('gives an administrator everything the others have', () => {
    const effective = expandRoles([Role.ADMIN]);

    expect(effective.has(Role.TECHNICIAN)).toBe(true);
    expect(effective.has(Role.QUALITY_MANAGER)).toBe(true);
    expect(effective.has(Role.AUDITOR)).toBe(true);
  });

  it('lets a metrologist do a technician job but not a quality manager one', () => {
    expect(hasAnyRole([Role.METROLOGIST], [Role.TECHNICIAN])).toBe(true);
    expect(hasAnyRole([Role.METROLOGIST], [Role.QUALITY_MANAGER])).toBe(false);
  });

  it('gives a quality manager the read only reach of an auditor', () => {
    expect(hasAnyRole([Role.QUALITY_MANAGER], [Role.AUDITOR])).toBe(true);
  });

  it('does not let an auditor do anything but read', () => {
    expect(hasAnyRole([Role.AUDITOR], [Role.TECHNICIAN])).toBe(false);
    expect(hasAnyRole([Role.AUDITOR], [Role.METROLOGIST])).toBe(false);
  });

  it('passes anything when a route names no role at all', () => {
    expect(hasAnyRole([Role.AUDITOR], [])).toBe(true);
  });

  it('accepts any one of several roles a route will take', () => {
    expect(hasAnyRole([Role.TECHNICIAN], [Role.QUALITY_MANAGER, Role.TECHNICIAN])).toBe(true);
  });
});

describe('an account', () => {
  it('signs in while it is enabled and unlocked', () => {
    expect(user().canSignIn(NOW)).toBe(true);
  });

  it('refuses a disabled account outright', () => {
    const account = user();
    account.enabled = false;

    expect(account.canSignIn(NOW)).toBe(false);
  });

  it('locks itself after the run of wrong passwords the policy allows', () => {
    const account = user();

    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      account.recordFailure(NOW);
      expect(account.isLocked(NOW)).toBe(false);
    }

    account.recordFailure(NOW);

    expect(account.isLocked(NOW)).toBe(true);
    expect(account.canSignIn(NOW)).toBe(false);
  });

  it('unlocks itself once the lockout window has passed', () => {
    const account = user();

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      account.recordFailure(NOW);
    }

    const later = new Date(NOW.getTime() + (LOCKOUT_MINUTES + 1) * 60_000);

    expect(account.isLocked(later)).toBe(false);
    expect(account.canSignIn(later)).toBe(true);
  });

  it('clears the counter and the lock on a good password', () => {
    const account = user();

    account.recordFailure(NOW);
    account.recordFailure(NOW);
    account.recordSuccess(NOW);

    expect(account.failedAttempts).toBe(0);
    expect(account.lockedUntil).toBeNull();
    expect(account.lastLoginAt).toEqual(NOW);
  });

  it('refuses a password change back to the same hash', () => {
    const account = user();

    expect(() => account.changePassword('hash-of-something', NOW)).toThrow('has to be different');
  });

  it('clears a lock when the password is changed', () => {
    const account = user();

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      account.recordFailure(NOW);
    }
    account.changePassword('a-different-hash', NOW);

    expect(account.isLocked(NOW)).toBe(false);
    expect(account.failedAttempts).toBe(0);
  });

  it('grants a role once however many times it is asked', () => {
    const account = user(Role.TECHNICIAN);

    account.grant(Role.METROLOGIST);
    account.grant(Role.METROLOGIST);

    expect(account.roles).toEqual([Role.TECHNICIAN, Role.METROLOGIST]);
  });

  it('refuses to revoke the last role somebody holds', () => {
    const account = user(Role.TECHNICIAN);

    expect(() => account.revoke(Role.TECHNICIAN)).toThrow('no role at all');
  });

  it('reports what it can do through the roles it holds', () => {
    const account = user(Role.METROLOGIST);

    expect(account.can(Role.TECHNICIAN)).toBe(true);
    expect(account.can(Role.ADMIN)).toBe(false);
    expect(account.effectiveRoles()).toContain(Role.TECHNICIAN);
  });
});

describe('an audit line', () => {
  it('records who did what to which thing and how it went', () => {
    const event = auditEvent(
      'r.okonjo',
      'certificate.withdraw',
      'certificate',
      '4417',
      AuditOutcome.ALLOWED,
      'standard found out of tolerance',
      'corr-1',
    );

    expect(event.actor).toBe('r.okonjo');
    expect(event.outcome).toBe(AuditOutcome.ALLOWED);
    expect(event.correlation).toBe('corr-1');
  });

  it('truncates rather than losing a line to a long detail', () => {
    const event = auditEvent(
      'r'.repeat(200),
      'a'.repeat(200),
      's'.repeat(200),
      'i'.repeat(200),
      AuditOutcome.DENIED,
      'd'.repeat(4000),
    );

    expect(event.actor).toHaveLength(64);
    expect(event.subjectId).toHaveLength(64);
    expect(event.detail).toHaveLength(1000);
  });
});
