import { AuditOutcome } from '@registry/security/audit-event.entity';
import {
  CERTIFICATE_RETENTION_YEARS,
  RETENTION_RULES,
  isExpired,
  keepFrom,
  retentionDays,
  ruleFor,
} from '@registry/security/audit-retention';

const NOW = new Date('2026-01-06T09:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe('how long each kind of line is kept', () => {
  it('drops a refused sign in after a month', () => {
    expect(retentionDays('auth.signIn', AuditOutcome.DENIED)).toBe(30);
  });

  it('keeps a successful sign in far longer than a refused one', () => {
    expect(retentionDays('auth.signIn', AuditOutcome.ALLOWED)).toBeGreaterThan(
      retentionDays('auth.signIn', AuditOutcome.DENIED),
    );
  });

  it('keeps a refresh only while a session could still be live', () => {
    expect(retentionDays('auth.refresh', AuditOutcome.ALLOWED)).toBe(90);
    expect(retentionDays('auth.refresh', AuditOutcome.DENIED)).toBe(90);
  });

  it('keeps role changes for years', () => {
    expect(retentionDays('user.setRoles', AuditOutcome.ALLOWED)).toBe(365 * 3);
  });

  it('keeps anything that changed a record as long as a certificate', () => {
    expect(retentionDays('certificate.withdraw', AuditOutcome.ALLOWED)).toBe(
      365 * CERTIFICATE_RETENTION_YEARS,
    );
  });

  it('keeps a refusal on anything else just as long', () => {
    expect(retentionDays('impact.close', AuditOutcome.DENIED)).toBe(
      365 * CERTIFICATE_RETENTION_YEARS,
    );
  });

  it('grades a line nobody thought about on the long rule', () => {
    expect(retentionDays('something.new', AuditOutcome.ALLOWED)).toBe(
      365 * CERTIFICATE_RETENTION_YEARS,
    );
  });

  it('says why, so nobody has to guess at the number', () => {
    expect(ruleFor('auth.signIn', AuditOutcome.DENIED).why).toContain('noise after a month');
  });

  it('ends with a rule that matches everything', () => {
    const last = RETENTION_RULES[RETENTION_RULES.length - 1];

    expect(last.outcomes).toBeNull();
    expect(last.actions.some((pattern) => pattern.test('anything at all'))).toBe(true);
  });
});

describe('whether a line has outlived its rule', () => {
  it('keeps a refused sign in for thirty days and not thirty one', () => {
    expect(isExpired('auth.signIn', AuditOutcome.DENIED, daysAgo(29), NOW)).toBe(false);
    expect(isExpired('auth.signIn', AuditOutcome.DENIED, daysAgo(31), NOW)).toBe(true);
  });

  it('does not drop a successful sign in of the same age', () => {
    expect(isExpired('auth.signIn', AuditOutcome.ALLOWED, daysAgo(31), NOW)).toBe(false);
  });

  it('keeps a withdrawal for the whole seven years', () => {
    expect(isExpired('certificate.withdraw', AuditOutcome.ALLOWED, daysAgo(2000), NOW)).toBe(
      false,
    );
    expect(isExpired('certificate.withdraw', AuditOutcome.ALLOWED, daysAgo(3000), NOW)).toBe(true);
  });

  it('never drops something written today', () => {
    for (const action of ['auth.signIn', 'auth.refresh', 'user.enable', 'anything']) {
      for (const outcome of Object.values(AuditOutcome)) {
        expect(isExpired(action, outcome, NOW, NOW)).toBe(false);
      }
    }
  });
});

describe('the cut off date', () => {
  it('is the rule counted back from now', () => {
    expect(keepFrom('auth.signIn', AuditOutcome.DENIED, NOW).toISOString().slice(0, 10)).toBe(
      '2025-12-07',
    );
  });

  it('is further back for the kinds kept longer', () => {
    expect(keepFrom('user.setRoles', AuditOutcome.ALLOWED, NOW).getTime()).toBeLessThan(
      keepFrom('auth.refresh', AuditOutcome.ALLOWED, NOW).getTime(),
    );
  });
});
