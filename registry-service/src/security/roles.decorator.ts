import { SetMetadata } from '@nestjs/common';

import { Role } from './role';

export const ROLES_KEY = 'registry:roles';

/** Names the roles a route will accept. Nothing named means any signed in user. */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'registry:public';

/**
 * Opens a route to callers with no token at all. Used on sign in, health and
 * the OpenAPI document, and nowhere else. The guard denies by default, so
 * forgetting this on a new route locks it rather than exposing it.
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
