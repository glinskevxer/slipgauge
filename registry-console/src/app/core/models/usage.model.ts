export interface UsageView {
  readonly id: number;
  readonly instrumentId: number;
  readonly assetTag: string;
  readonly usedOn: string;
  readonly usedBy: string;
  readonly workOrder: string | null;
  readonly customer: string | null;
  readonly purpose: string | null;
  readonly readingCount: number;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface LogUsageRequest {
  readonly assetTag: string;
  readonly usedOn: string;
  readonly usedBy: string;
  readonly workOrder?: string | null;
  readonly customer?: string | null;
  readonly purpose?: string | null;
  readonly readingCount?: number | null;
  readonly note?: string | null;
}

export interface UsageWindow {
  readonly from: string;
  readonly to: string;
  readonly uses: readonly UsageView[];
  readonly distinctWorkOrders: number;
}

/**
 * A use with neither a work order nor a customer cannot be chased if the
 * instrument later turns out to have been wrong, so the console says so at the
 * point of entry rather than leaving it for an impact assessment to discover.
 */
export function isUntraceable(use: UsageView | LogUsageRequest): boolean {
  return !use.workOrder?.trim() && !use.customer?.trim();
}

/** Groups uses by work order, biggest first, for the instrument's usage tab. */
export function byWorkOrder(
  uses: readonly UsageView[],
): ReadonlyArray<{ workOrder: string; uses: readonly UsageView[]; readings: number }> {
  const buckets = new Map<string, UsageView[]>();
  for (const use of uses) {
    const key = use.workOrder?.trim() || 'No work order';
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(use);
    } else {
      buckets.set(key, [use]);
    }
  }
  return [...buckets.entries()]
    .map(([workOrder, entries]) => ({
      workOrder,
      uses: entries,
      readings: entries.reduce((total, entry) => total + entry.readingCount, 0),
    }))
    .sort((a, b) => b.readings - a.readings || a.workOrder.localeCompare(b.workOrder));
}

/** Total readings taken, which is what an impact assessment is really counting. */
export function totalReadings(uses: readonly UsageView[]): number {
  return uses.reduce((total, use) => total + use.readingCount, 0);
}

/** The span the uses cover, or null when there are none. */
export function usageSpan(uses: readonly UsageView[]): readonly [string, string] | null {
  if (uses.length === 0) {
    return null;
  }
  const dates = uses.map((use) => use.usedOn).sort();
  return [dates[0], dates[dates.length - 1]];
}
