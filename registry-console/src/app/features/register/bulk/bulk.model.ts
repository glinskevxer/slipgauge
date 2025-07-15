import { InstrumentStatus, InstrumentSummary, statusLabel } from '@core/models/instrument.model';

/**
 * Acting on a set of instruments at once.
 *
 * <p>The register is worked through in batches: a shelf comes back from a
 * supplier, a room is decommissioned, a technician leaves. Doing those one at a
 * time is where the mistakes are, so this works out what an action would do to
 * a selection before any of it is sent.
 */

export type BulkAction = 'STATUS' | 'CUSTODIAN' | 'LOCATION' | 'EXPORT';

export interface BulkPlan {
  readonly action: BulkAction;
  readonly eligible: readonly InstrumentSummary[];
  readonly blocked: readonly BlockedRow[];
}

export interface BlockedRow {
  readonly instrument: InstrumentSummary;
  readonly reason: string;
}

const TRANSITIONS: Readonly<Record<InstrumentStatus, readonly InstrumentStatus[]>> = {
  IN_SERVICE: ['IN_CALIBRATION', 'QUARANTINED', 'UNDER_REPAIR', 'ON_LOAN', 'RETIRED'],
  IN_CALIBRATION: ['IN_SERVICE', 'QUARANTINED', 'UNDER_REPAIR', 'RETIRED'],
  QUARANTINED: ['UNDER_REPAIR', 'IN_CALIBRATION', 'RETIRED'],
  UNDER_REPAIR: ['IN_CALIBRATION', 'RETIRED'],
  ON_LOAN: ['IN_SERVICE', 'QUARANTINED'],
  RETIRED: [],
};

export function canTransition(from: InstrumentStatus, to: InstrumentStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

/** Every status any of the selected instruments could legitimately move to. */
export function reachableFrom(
  selection: readonly InstrumentSummary[],
): readonly InstrumentStatus[] {
  const reachable = new Set<InstrumentStatus>();
  for (const instrument of selection) {
    for (const target of TRANSITIONS[instrument.status]) {
      reachable.add(target);
    }
  }
  return [...reachable].sort();
}

/**
 * Splits a selection into what an action can be applied to and what it cannot,
 * with a reason for each exclusion. Nothing is sent until a person has seen
 * this.
 */
export function planStatusChange(
  selection: readonly InstrumentSummary[],
  target: InstrumentStatus,
): BulkPlan {
  const eligible: InstrumentSummary[] = [];
  const blocked: BlockedRow[] = [];

  for (const instrument of selection) {
    if (instrument.status === target) {
      blocked.push({
        instrument,
        reason: `already ${statusLabel(target).toLowerCase()}`,
      });
    } else if (!canTransition(instrument.status, target)) {
      blocked.push({
        instrument,
        reason: `cannot go from ${statusLabel(instrument.status).toLowerCase()} to ${statusLabel(
          target,
        ).toLowerCase()}`,
      });
    } else {
      eligible.push(instrument);
    }
  }

  return { action: 'STATUS', eligible, blocked };
}

export function planCustodianChange(
  selection: readonly InstrumentSummary[],
  custodian: string,
): BulkPlan {
  const trimmed = custodian.trim();
  const eligible: InstrumentSummary[] = [];
  const blocked: BlockedRow[] = [];

  for (const instrument of selection) {
    if (instrument.status === 'RETIRED') {
      blocked.push({ instrument, reason: 'retired instruments have no custodian' });
    } else if ((instrument.custodian ?? '') === trimmed) {
      blocked.push({ instrument, reason: 'already assigned to that person' });
    } else {
      eligible.push(instrument);
    }
  }

  return { action: 'CUSTODIAN', eligible, blocked };
}

export interface BulkOutcome {
  readonly succeeded: number;
  readonly failed: ReadonlyArray<{ assetTag: string; message: string }>;
}

export function summarise(outcome: BulkOutcome): string {
  if (outcome.failed.length === 0) {
    return `${outcome.succeeded} updated`;
  }
  if (outcome.succeeded === 0) {
    return `none updated, ${outcome.failed.length} refused`;
  }
  return `${outcome.succeeded} updated, ${outcome.failed.length} refused`;
}

/** Groups the failures by message, since a batch usually fails the same way. */
export function groupFailures(
  outcome: BulkOutcome,
): ReadonlyArray<{ message: string; assetTags: readonly string[] }> {
  const buckets = new Map<string, string[]>();
  for (const failure of outcome.failed) {
    const bucket = buckets.get(failure.message);
    if (bucket) {
      bucket.push(failure.assetTag);
    } else {
      buckets.set(failure.message, [failure.assetTag]);
    }
  }
  return [...buckets.entries()]
    .map(([message, assetTags]) => ({ message, assetTags }))
    .sort((a, b) => b.assetTags.length - a.assetTags.length);
}
