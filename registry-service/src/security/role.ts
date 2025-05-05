/**
 * What a person is allowed to do. The names are the laboratory's own, and the
 * separation between the first three is the one an assessment looks at.
 */
export enum Role {
  /** Runs the bench and records results. Cannot approve their own work. */
  TECHNICIAN = 'TECHNICIAN',
  /** Signs certificates off and adjusts intervals by hand. */
  METROLOGIST = 'METROLOGIST',
  /** Closes impact assessments and withdraws certificates. */
  QUALITY_MANAGER = 'QUALITY_MANAGER',
  /** Read only across everything, including withdrawn records. */
  AUDITOR = 'AUDITOR',
  /** Manages accounts and reference data. */
  ADMIN = 'ADMIN',
}

export const ALL_ROLES: readonly Role[] = Object.values(Role);

/**
 * ADMIN is not a superset of the others by accident of checking. It is written
 * down here, so a route that names QUALITY_MANAGER can be read as exactly that
 * plus the administrator who has to be able to unblock it out of hours.
 */
const IMPLIED: Readonly<Record<Role, readonly Role[]>> = {
  [Role.ADMIN]: [Role.TECHNICIAN, Role.METROLOGIST, Role.QUALITY_MANAGER, Role.AUDITOR],
  [Role.QUALITY_MANAGER]: [Role.AUDITOR],
  [Role.METROLOGIST]: [Role.TECHNICIAN],
  [Role.TECHNICIAN]: [],
  [Role.AUDITOR]: [],
};

/** Every role a holder of these roles effectively has. */
export function expandRoles(held: readonly Role[]): Set<Role> {
  const effective = new Set<Role>();

  for (const role of held) {
    effective.add(role);
    for (const implied of IMPLIED[role] ?? []) {
      effective.add(implied);
    }
  }
  return effective;
}

export function hasAnyRole(held: readonly Role[], required: readonly Role[]): boolean {
  if (required.length === 0) {
    return true;
  }
  const effective = expandRoles(held);

  return required.some((role) => effective.has(role));
}

export function isRole(value: string): value is Role {
  return (ALL_ROLES as readonly string[]).includes(value);
}
