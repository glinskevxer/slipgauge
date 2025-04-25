/**
 * How much the laboratory thinks a failure actually cost. Worked out from the
 * shape of what was found, not typed in, so two assessors reading the same
 * cascade reach the same answer.
 */
export enum ImpactSeverity {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ImpactKind {
  /** A job the failed instrument took a reading on. */
  USAGE = 'USAGE',
  /** A certificate the failed instrument was the reference for. */
  CERTIFICATE = 'CERTIFICATE',
  /** An instrument whose own calibration now rests on a bad measurement. */
  INSTRUMENT = 'INSTRUMENT',
}

export enum ImpactDisposition {
  /** Nobody has looked at this line yet. */
  PENDING = 'PENDING',
  /** Reviewed and the error could not have mattered at this magnitude. */
  NO_EFFECT = 'NO_EFFECT',
  /** The customer has been told. */
  CUSTOMER_NOTIFIED = 'CUSTOMER_NOTIFIED',
  /** Product or certificates were pulled back. */
  RECALLED = 'RECALLED',
  /** The measurement was redone. */
  REWORKED = 'REWORKED',
  /** The customer looked at it and accepted it as it stands. */
  ACCEPTED = 'ACCEPTED',
}

export enum ImpactStatus {
  OPEN = 'OPEN',
  ASSESSED = 'ASSESSED',
  CLOSED = 'CLOSED',
}

export function isSettled(disposition: ImpactDisposition): boolean {
  return disposition !== ImpactDisposition.PENDING;
}

export function needsCustomerContact(severity: ImpactSeverity): boolean {
  return severity === ImpactSeverity.MEDIUM || severity === ImpactSeverity.HIGH;
}

/**
 * The severity rule, in one place so it can be argued about in one place.
 *
 * @param items everything caught in the cascade
 * @param depth how far the cascade had to walk
 * @param criticalStandardsHit downstream reference standards that were hit
 */
export function severityFrom(
  items: number,
  depth: number,
  criticalStandardsHit: number,
): ImpactSeverity {
  if (items === 0) {
    return ImpactSeverity.NONE;
  }
  if (criticalStandardsHit > 0 || depth >= 2 || items > 40) {
    return ImpactSeverity.HIGH;
  }
  if (depth === 1 || items > 8) {
    return ImpactSeverity.MEDIUM;
  }
  return ImpactSeverity.LOW;
}
