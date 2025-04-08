import { registerAs } from '@nestjs/config';

import { Criticality, extensionFactor } from '../instrument/instrument.enums';

/**
 * The numbers the laboratory's own procedure fixes for interval review.
 *
 * <p>They are configuration rather than constants because the accreditation
 * body has to approve a change to any of them, and a rebuild to change a
 * number is a change nobody can point at afterwards.
 */
export interface IntervalPolicy {
  /** Clean results needed in a row before any extension is earned. */
  readonly passesBeforeExtension: number;
  /** Fraction of the base interval one extension step is worth. */
  readonly extensionStep: number;
  /** What an out of tolerance result multiplies the interval by. */
  readonly failureFactor: number;
  /**
   * Drift above this fraction of the tolerance blocks an extension even when
   * every result passed. An instrument sitting at ninety percent of its limit
   * is about to fail, and the run of passes says nothing useful about that.
   */
  readonly driftBrake: number;
}

export const DEFAULT_INTERVAL_POLICY: IntervalPolicy = {
  passesBeforeExtension: 2,
  extensionStep: 0.15,
  failureFactor: 0.5,
  driftBrake: 0.7,
};

export const intervalPolicyConfig = registerAs('interval', (): IntervalPolicy => {
  const policy: IntervalPolicy = {
    passesBeforeExtension: readNumber(
      'REGISTRY_INTERVAL_PASSES',
      DEFAULT_INTERVAL_POLICY.passesBeforeExtension,
    ),
    extensionStep: readNumber(
      'REGISTRY_INTERVAL_EXTENSION_STEP',
      DEFAULT_INTERVAL_POLICY.extensionStep,
    ),
    failureFactor: readNumber(
      'REGISTRY_INTERVAL_FAILURE_FACTOR',
      DEFAULT_INTERVAL_POLICY.failureFactor,
    ),
    driftBrake: readNumber('REGISTRY_INTERVAL_DRIFT_BRAKE', DEFAULT_INTERVAL_POLICY.driftBrake),
  };

  return validatePolicy(policy);
});

/**
 * A policy outside these bounds is not a tuning choice, it is a typo that
 * would quietly change every recall date in the register. Failing at boot is
 * the only place anybody would notice.
 */
export function validatePolicy(policy: IntervalPolicy): IntervalPolicy {
  requireWithin('passesBeforeExtension', policy.passesBeforeExtension, 1, 12);
  requireWithin('extensionStep', policy.extensionStep, 0.01, 1);
  requireWithin('failureFactor', policy.failureFactor, 0.1, 1);
  requireWithin('driftBrake', policy.driftBrake, 0.1, 1);
  return policy;
}

/** One extension step in days, weighted by how much the instrument matters. */
export function stepFor(
  policy: IntervalPolicy,
  criticality: Criticality,
  baseIntervalDays: number,
): number {
  return Math.round(baseIntervalDays * policy.extensionStep * extensionFactor(criticality));
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is not a number: ${raw}`);
  }
  return parsed;
}

function requireWithin(name: string, value: number, low: number, high: number): void {
  if (!Number.isFinite(value) || value < low || value > high) {
    throw new Error(`the interval policy ${name} must sit between ${low} and ${high}, got ${value}`);
  }
}
