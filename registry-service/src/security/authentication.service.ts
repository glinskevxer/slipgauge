import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { compareSync, hashSync } from 'bcryptjs';

import {
  ConflictError,
  ErrorCode,
  NotFoundError,
  RegistryException,
  RuleViolationError,
} from '../common/errors';
import { Clock } from '../config/clock';
import { RegistryMetrics } from '../observability/registry-metrics.service';
import type { SecurityConfig } from '../config/security.config';
import { AppUser } from './app-user.entity';
import { AttemptLimiter } from './attempt-limiter.service';
import { AuditTrail } from './audit-trail.service';
import type {
  AccountView,
  ChangePasswordDto,
  CreateUserDto,
  SignInDto,
  TokenPair,
  UpdateRolesDto,
} from './dto/sign-in.dto';
import { checkPassword, mustChange, rotationNotice } from './password-policy';
import { Role } from './role';
import { TokenService } from './token.service';

/** Refused sign in, worded so it says nothing about which half was wrong. */
class SignInRefused extends RegistryException {
  constructor() {
    super(
      ErrorCode.UNAUTHENTICATED,
      HttpStatus.UNAUTHORIZED,
      'that username and password do not match',
    );
  }
}

/** Refused because the caller is going too fast, not because it was wrong. */
class TooManyAttempts extends RegistryException {
  constructor(retryAfterSeconds: number) {
    super(
      ErrorCode.UNAUTHENTICATED,
      HttpStatus.TOO_MANY_REQUESTS,
      `too many sign in attempts, try again in ${retryAfterSeconds} seconds`,
    );
    this.with('retryAfterSeconds', retryAfterSeconds);
  }
}

/**
 * Signs people in and manages accounts.
 *
 * <p>Every refusal comes back with the same message. Telling a caller that the
 * username exists but the password was wrong is a free list of usernames, and
 * this service is on a laboratory network that visitors get onto.
 */
@Injectable()
export class AuthenticationService {
  private readonly log = new Logger(AuthenticationService.name);

  constructor(
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
    private readonly audit: AuditTrail,
    private readonly metrics: RegistryMetrics,
    private readonly limiter: AttemptLimiter,
    private readonly config: ConfigService,
    private readonly clock: Clock,
  ) {}

  private rounds(): number {
    return this.config.getOrThrow<SecurityConfig>('security').bcryptRounds;
  }

  /**
   * The limiter is asked before the password is even hashed. Bcrypt at the
   * configured work factor is the expensive part of this method, so a guessing
   * run that gets that far is a denial of service whether or not it ever
   * guesses right.
   */
  async signIn(request: SignInDto, from = 'unknown'): Promise<TokenPair> {
    const now = this.clock.now();

    for (const key of [`user:${request.username}`, `from:${from}`]) {
      const decision = this.limiter.record(key);

      if (!decision.allowed) {
        await this.audit.denied(
          request.username,
          'auth.signIn',
          'user',
          null,
          `rate limited, ${decision.retryAfterSeconds}s to wait`,
        );
        this.metrics.signIn('denied');
        throw new TooManyAttempts(decision.retryAfterSeconds);
      }
    }

    const user = await this.byUsername(request.username);

    if (!user) {
      await this.audit.denied(request.username, 'auth.signIn', 'user', null, 'no such account');
      this.metrics.signIn('denied');
      throw new SignInRefused();
    }

    if (!user.canSignIn(now)) {
      await this.audit.denied(user.username, 'auth.signIn', 'user', String(user.id), 'locked');
      this.metrics.signIn('denied');
      throw new SignInRefused();
    }

    if (!compareSync(request.password, user.passwordHash)) {
      user.recordFailure(now);
      await this.users.save(user);
      await this.audit.denied(
        user.username,
        'auth.signIn',
        'user',
        String(user.id),
        `wrong password, attempt ${user.failedAttempts}`,
      );
      this.metrics.signIn('denied');
      throw new SignInRefused();
    }

    user.recordSuccess(now);
    await this.users.save(user);
    this.limiter.clear(`user:${user.username}`);
    this.limiter.clear(`from:${from}`);
    await this.audit.allowed(user.username, 'auth.signIn', 'user', String(user.id));
    this.metrics.signIn('allowed');

    return this.pairFor(user);
  }

  /** Trades a refresh token for a new pair, re-reading the roles as it goes. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let username: string;

    try {
      username = this.tokens.verify(refreshToken, 'refresh').username;
    } catch {
      throw new SignInRefused();
    }

    const user = await this.byUsername(username);

    if (!user || !user.canSignIn(this.clock.now())) {
      throw new SignInRefused();
    }
    return this.pairFor(user);
  }

  async changePassword(username: string, request: ChangePasswordDto): Promise<void> {
    const user = await this.byUsername(username);

    if (!user || !compareSync(request.currentPassword, user.passwordHash)) {
      await this.audit.denied(username, 'auth.changePassword', 'user', null, 'wrong password');
      throw new SignInRefused();
    }

    const problems = checkPassword(request.newPassword, user.username);

    if (problems.length > 0) {
      await this.audit.denied(
        username,
        'auth.changePassword',
        'user',
        String(user.id),
        `refused by the password policy: ${problems.map((p) => p.rule).join(', ')}`,
      );
      throw new RuleViolationError(
        problems.map((problem) => problem.detail).join('; '),
      ).with('rules', problems.map((problem) => problem.rule));
    }
    if (compareSync(request.newPassword, user.passwordHash)) {
      throw new RuleViolationError('the new password has to be different from the old one');
    }

    user.changePassword(hashSync(request.newPassword, this.rounds()), this.clock.now());
    await this.users.save(user);
    await this.audit.allowed(username, 'auth.changePassword', 'user', String(user.id));
  }

  async createUser(actor: string, request: CreateUserDto): Promise<AccountView> {
    const clash = await this.users.findOne({
      where: [{ username: request.username }, { email: request.email }],
    });

    if (clash) {
      throw ConflictError.duplicate('account', request.username);
    }
    if (request.roles.length === 0) {
      throw new ConflictError('an account needs at least one role');
    }

    const user = new AppUser();

    user.username = request.username;
    user.displayName = request.displayName;
    user.email = request.email;
    user.passwordHash = hashSync(request.password, this.rounds());
    user.enabled = true;
    user.lockedUntil = null;
    user.failedAttempts = 0;
    user.passwordSetAt = this.clock.now();
    user.lastLoginAt = null;
    user.roles = [...new Set(request.roles)];

    const saved = await this.users.save(user);

    // save returns the same instance here, but spreading it into a literal
    // would drop the prototype and with it every method toView calls.
    saved.roles = user.roles;
    await this.writeRoles(saved.id, saved.roles);
    await this.audit.allowed(actor, 'user.create', 'user', String(saved.id), request.username);

    this.log.log(`account ${request.username} created by ${actor}`);
    return this.toView(saved);
  }

  async setRoles(actor: string, userId: number, request: UpdateRolesDto): Promise<AccountView> {
    const user = await this.byId(userId);

    if (request.roles.length === 0) {
      throw new ConflictError(`${user.username} would be left with no role at all`);
    }

    user.roles = [...new Set(request.roles)];
    await this.writeRoles(user.id, user.roles);
    await this.audit.allowed(
      actor,
      'user.setRoles',
      'user',
      String(user.id),
      `${user.roles.join(', ')}${request.reason ? `: ${request.reason}` : ''}`,
    );
    return this.toView(user);
  }

  async setEnabled(actor: string, userId: number, enabled: boolean): Promise<AccountView> {
    const user = await this.byId(userId);

    user.enabled = enabled;
    if (enabled) {
      user.failedAttempts = 0;
      user.lockedUntil = null;
    }
    await this.users.save(user);
    await this.audit.allowed(actor, enabled ? 'user.enable' : 'user.disable', 'user', String(userId));
    return this.toView(user);
  }

  async list(): Promise<AccountView[]> {
    const found = await this.users.find({ order: { username: 'ASC' } });

    await Promise.all(found.map(async (user) => this.loadRoles(user)));
    return found.map((user) => this.toView(user));
  }

  async byUsername(username: string): Promise<AppUser | null> {
    const user = await this.users.findOne({ where: { username } });

    if (user) {
      await this.loadRoles(user);
    }
    return user;
  }

  private async byId(id: number): Promise<AppUser> {
    const user = await this.users.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundError('account', id);
    }
    await this.loadRoles(user);
    return user;
  }

  /**
   * Roles come from the side table by hand rather than through a relation.
   * The table is a plain pair with no entity of its own, and giving it one
   * only to read two columns would be more code, not less.
   */
  private async loadRoles(user: AppUser): Promise<void> {
    const rows: { role: Role }[] = await this.dataSource.query(
      'select role from app_user_role where user_id = $1 order by role',
      [user.id],
    );

    user.roles = rows.map((row) => row.role);
  }

  private async writeRoles(userId: number, roles: readonly Role[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('delete from app_user_role where user_id = $1', [userId]);

      for (const role of roles) {
        await manager.query('insert into app_user_role (user_id, role) values ($1, $2)', [
          userId,
          role,
        ]);
      }
    });
  }

  private pairFor(user: AppUser): TokenPair {
    const now = this.clock.now();

    return {
      accessToken: this.tokens.issueAccess(user),
      refreshToken: this.tokens.issueRefresh(user),
      expiresInSeconds: this.tokens.accessTtlSeconds(),
      tokenType: 'Bearer',
      mustChangePassword: mustChange(user.passwordSetAt, now),
      passwordNotice: rotationNotice(user.passwordSetAt, now),
    };
  }

  private toView(user: AppUser): AccountView {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      enabled: user.enabled,
      locked: user.isLocked(this.clock.now()),
      roles: user.roles,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }
}
