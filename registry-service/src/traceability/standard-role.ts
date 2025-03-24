/**
 * Why a standard was present at a calibration. Only a REFERENCE carries the
 * measurement, so only a REFERENCE propagates a failure back down the chain.
 */
export enum StandardRole {
  /** The standard the result was measured against. Carries traceability. */
  REFERENCE = 'REFERENCE',
  /** A second standard used to confirm the first. Does not carry the result. */
  CHECK = 'CHECK',
  /** Thermometers and hygrometers recording the conditions, not the quantity. */
  ENVIRONMENT = 'ENVIRONMENT',
}

export function carriesTraceability(role: StandardRole): boolean {
  return role === StandardRole.REFERENCE;
}
