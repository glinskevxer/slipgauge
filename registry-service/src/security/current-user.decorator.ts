import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { AuthenticatedRequest } from './jwt-auth.guard';
import type { Principal } from './token.service';

/** The principal the guard put on the request. Never null behind the guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.principal) {
      throw new Error('CurrentUser was read on a route the guard did not cover');
    }
    return request.principal;
  },
);
