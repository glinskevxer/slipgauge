import { Injectable, computed, inject, signal } from '@angular/core';

import { RecallApiService, RecallSummary } from '@core/api/recall-api.service';
import { LoadingState } from '@core/loading-state';
import { Criticality } from '@core/models/instrument.model';
import { RecallEntry, RecallStanding } from '@core/models/recall.model';

export type RecallGrouping = 'standing' | 'location' | 'custodian' | 'class';

/**
 * The recall board. Grouping and filtering happen here rather than in the
 * template because the same list is read three ways on the same screen, and
 * recomputing it per section is what made the board stutter at four thousand
 * instruments.
 */
@Injectable()
export class RecallStore {
  private readonly api = inject(RecallApiService);

  private readonly entriesState = signal<readonly RecallEntry[]>([]);
  private readonly summaryState = signal<RecallSummary | null>(null);
  private readonly horizonState = signal(60);
  private readonly groupingState = signal<RecallGrouping>('standing');
  private readonly criticalityState = signal<ReadonlySet<Criticality>>(new Set());
  private readonly referenceOnlyState = signal(false);
  private readonly state = new LoadingState();

  readonly summary = this.summaryState.asReadonly();
  readonly horizon = this.horizonState.asReadonly();
  readonly grouping = this.groupingState.asReadonly();
  readonly criticalities = this.criticalityState.asReadonly();
  readonly referenceOnly = this.referenceOnlyState.asReadonly();
  readonly loading = this.state.loading;
  readonly error = this.state.error;

  readonly entries = computed(() => {
    const chosen = this.criticalityState();
    const referenceOnly = this.referenceOnlyState();
    return this.entriesState().filter((entry) => {
      if (referenceOnly && !entry.referenceStandard) {
        return false;
      }
      return chosen.size === 0 || chosen.has(entry.criticality);
    });
  });

  readonly overdue = computed(() =>
    this.entries().filter((entry) => entry.standing === 'OVERDUE'),
  );

  readonly thisWeek = computed(() =>
    this.entries().filter((entry) => entry.standing === 'DUE_THIS_WEEK'),
  );

  readonly groups = computed(() => {
    const grouping = this.groupingState();
    const buckets = new Map<string, RecallEntry[]>();
    for (const entry of this.entries()) {
      const key = keyFor(entry, grouping);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        buckets.set(key, [entry]);
      }
    }
    return [...buckets.entries()]
      .map(([key, items]) => ({
        key,
        items,
        overdue: items.filter((entry) => entry.standing === 'OVERDUE').length,
      }))
      .sort((a, b) => b.overdue - a.overdue || a.key.localeCompare(b.key));
  });

  readonly worstFirst = computed(() =>
    [...this.entries()].sort((a, b) => a.daysUntilDue - b.daysUntilDue),
  );

  readonly isEmpty = computed(() => !this.state.loading() && this.entries().length === 0);

  load(): void {
    const horizon = this.horizonState();

    this.state.track(this.api.board(horizon), (entries) => this.entriesState.set(entries));

    this.state.beside(
      this.api.summary(horizon),
      (summary) => this.summaryState.set(summary),
      () => this.summaryState.set(null),
    );
  }

  setHorizon(days: number): void {
    this.horizonState.set(Math.max(1, Math.min(730, days)));
    this.load();
  }

  groupBy(grouping: RecallGrouping): void {
    this.groupingState.set(grouping);
  }

  toggleCriticality(criticality: Criticality): void {
    const next = new Set(this.criticalityState());
    if (!next.delete(criticality)) {
      next.add(criticality);
    }
    this.criticalityState.set(next);
  }

  toggleReferenceOnly(): void {
    this.referenceOnlyState.update((on) => !on);
  }

  countFor(standing: RecallStanding): number {
    return this.entries().filter((entry) => entry.standing === standing).length;
  }
}

function keyFor(entry: RecallEntry, grouping: RecallGrouping): string {
  switch (grouping) {
    case 'location':
      return entry.locationCode ?? 'Unplaced';
    case 'custodian':
      return entry.custodian ?? 'Unassigned';
    case 'class':
      return entry.classCode;
    case 'standing':
      return entry.standing;
  }
}
