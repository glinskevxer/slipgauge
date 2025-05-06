import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { SecurityConfig } from '../config/security.config';
import { Clock } from '../config/clock';
import { AppUser } from './app-user.entity';
import { Role, isRole } from './role';

/** What travels in a token. Kept small: a token is not a place to cache. */
export interface RegistryClaims {
  readonly sub: string;
  readonly uid: number;
  readonly name: string;
  readonly roles: string[];
  /** Access or refresh, checked on the way back in. */
  readonly typ: 'access' | 'refresh';
}

/** A claims set that has been read back and checked. */
export interface Principal {
  readonly userId: number;
  readonly username: string;
  readonly displayName: string;
  readonly roles: Role[];
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly clock: Clock,
  ) {}

  private security(): SecurityConfig {
    return this.config.getOrThrow<SecurityConfig>('security');
  }

  issueAccess(user: AppUser): string {
    return this.sign(user, 'access', this.security().accessTokenTtlSeconds);
  }

  issueRefresh(user: AppUser): string {
    return this.sign(user, 'refresh', this.security().refreshTokenTtlSeconds);
  }

  accessTtlSeconds(): number {
    return this.security().accessTokenTtlSeconds;
  }

  /**
   * Reads a token and refuses anything about it that is wrong, including a
   * refresh token used where an access token belongs. That swap is the one an
   * attacker reaches for first, because a refresh token lives far longer.
   */
  verify(token: string, expected: 'access' | 'refresh'): Principal {
    const security = this.security();
    const claims = this.jwt.verify<RegistryClaims>(token, {
      secret: security.jwtSecret,
      issuer: security.jwtIssuer,
      clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
    });

    if (claims.typ !== expected) {
      throw new Error(`expected a ${expected} token, got a ${claims.typ} one`);
    }

    return {
      userId: claims.uid,
      username: claims.sub,
      displayName: claims.name,
      roles: (claims.roles ?? []).filter(isRole),
    };
  }

  private sign(user: AppUser, typ: 'access' | 'refresh', ttlSeconds: number): string {
    const security = this.security();
    const claims: RegistryClaims = {
      sub: user.username,
      uid: user.id,
      name: user.displayName,
      roles: user.roles,
      typ,
    };

    return this.jwt.sign(claims, {
      secret: security.jwtSecret,
      issuer: security.jwtIssuer,
      expiresIn: ttlSeconds,
    });
  }
}
