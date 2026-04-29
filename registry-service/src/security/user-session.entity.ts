import { randomBytes } from 'node:crypto';

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  RelationId,
} from 'typeorm';

import { AppUser } from './app-user.entity';

/**
 * One sign in, and whether it is still allowed to hand out access tokens.
 *
 * <p>The id is random rather than sequential and it travels in the refresh
 * token. A sequential one would let anybody holding one token work out that
 * others exist, which is not a secret worth leaking for the sake of a smaller
 * column.
 */
@Entity({ name: 'user_session' })
export class UserSession {
  @PrimaryColumn({ type: 'char', length: 32 })
  id: string;

  @ManyToOne(() => AppUser, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: AppUser;

  @RelationId((session: UserSession) => session.user)
  userId: number;

  /** Copied down so a revocation list reads without joining. */
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'signed_in_from', type: 'varchar', length: 120, nullable: true })
  signedInFrom: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'varchar', length: 120, nullable: true })
  revokedBy: string | null;

  @Column({ name: 'revoke_reason', type: 'varchar', length: 200, nullable: true })
  revokeReason: string | null;

  isRevoked(): boolean {
    return this.revokedAt !== null && this.revokedAt !== undefined;
  }

  /** True when this session may still be traded for a fresh pair of tokens. */
  isLiveAt(now: Date): boolean {
    return !this.isRevoked() && this.expiresAt.getTime() > now.getTime();
  }

  revoke(by: string, reason: string, at: Date): void {
    if (this.isRevoked()) {
      return;
    }
    this.revokedAt = at;
    this.revokedBy = by;
    this.revokeReason = reason;
  }

  touch(at: Date): void {
    this.lastUsedAt = at;
  }

  /** Why the session is not usable, for the revocation list. */
  standing(now: Date): 'live' | 'revoked' | 'expired' {
    if (this.isRevoked()) {
      return 'revoked';
    }
    return this.expiresAt.getTime() > now.getTime() ? 'live' : 'expired';
  }
}

export function newSessionId(): string {
  return randomBytes(16).toString('hex');
}

export function userSession(
  user: AppUser,
  ttlSeconds: number,
  from: string | null,
  now: Date,
): UserSession {
  const session = new UserSession();

  session.id = newSessionId();
  session.user = user;
  session.username = user.username;
  session.startedAt = now;
  session.lastUsedAt = now;
  session.expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  session.signedInFrom = from;
  session.revokedAt = null;
  session.revokedBy = null;
  session.revokeReason = null;
  return session;
}
