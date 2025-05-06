import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { Role, hasAnyRole } from './role';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';
import { Principal, TokenService } from './token.service';

/** A request that has been through the guard carries its principal here. */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/**
 * Denies by default.
 *
 * <p>Every route needs either a token or an explicit Public marker. That way
 * round is on purpose: a new endpoint added without a thought about access is
 * closed, and the mistake shows up as a 401 in development rather than as an
 * open endpoint in production.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = this.read(request);

    request.principal = principal;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets) ?? [];

    if (!hasAnyRole(principal.roles, required)) {
      throw new ForbiddenException(
        `this needs one of ${required.join(', ')} and you hold ${principal.roles.join(', ')}`,
      );
    }
    return true;
  }

  private read(request: AuthenticatedRequest): Principal {
    const header = request.headers.authorization ?? '';

    if (!header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('this endpoint needs a bearer token');
    }

    try {
      return this.tokens.verify(header.slice('bearer '.length).trim(), 'access');
    } catch {
      throw new UnauthorizedException('that token is not usable');
    }
  }
}
