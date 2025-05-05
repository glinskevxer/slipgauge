import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { Role, expandRoles, hasAnyRole } from './role';

/** How many wrong passwords in a row lock the account. */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long the lock lasts once it trips. */
export const LOCKOUT_MINUTES = 15;

/**
 * A person who signs in. Roles live in a side table rather than a column, so
 * a person can hold two, which happens on every small shift.
 */
@Entity({ name: 'app_user' })
export class AppUser extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  username: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'varchar', length: 160, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 120 })
  passwordHash: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'failed_attempts', type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ name: 'password_set_at', type: 'timestamptz' })
  passwordSetAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** Loaded from app_user_role rather than mapped, so it is set by the service. */
  roles: Role[] = [];

  isLocked(now: Date): boolean {
    return this.lockedUntil !== null && this.lockedUntil > now;
  }

  canSignIn(now: Date): boolean {
    return this.enabled && !this.isLocked(now);
  }

  /**
   * One more wrong password. The lock trips exactly at the limit and the
   * counter keeps climbing, so a second run of attempts extends nothing but
   * still shows up in the audit trail.
   */
  recordFailure(now: Date): void {
    this.failedAttempts += 1;

    if (this.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      this.lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60_000);
    }
  }

  recordSuccess(now: Date): void {
    this.failedAttempts = 0;
    this.lockedUntil = null;
    this.lastLoginAt = now;
  }

  changePassword(hash: string, now: Date): void {
    if (hash === this.passwordHash) {
      throw new RuleViolationError('the new password has to be different from the old one');
    }
    this.passwordHash = hash;
    this.passwordSetAt = now;
    this.failedAttempts = 0;
    this.lockedUntil = null;
  }

  grant(role: Role): void {
    if (!this.roles.includes(role)) {
      this.roles.push(role);
    }
  }

  revoke(role: Role): void {
    if (this.roles.length === 1 && this.roles[0] === role) {
      throw new RuleViolationError(`${this.username} would be left with no role at all`);
    }
    this.roles = this.roles.filter((held) => held !== role);
  }

  /** Every role this person effectively holds, implications included. */
  effectiveRoles(): Role[] {
    return [...expandRoles(this.roles)];
  }

  can(...required: Role[]): boolean {
    return hasAnyRole(this.roles, required);
  }
}
