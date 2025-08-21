import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { ImpactApiService } from '@core/api/impact-api.service';
import { RecallApiService, RecallSummary } from '@core/api/recall-api.service';
import { RegistryError } from '@core/errors/problem';
import { ImpactView } from '@core/models/impact.model';
import { RecallEntry, RecallStanding } from '@core/models/recall.model';
import { BarDatum } from '@shared/charts/bar-chart.component';
import { DonutSlice } from '@shared/charts/donut-chart.component';

const HORIZON_DAYS = 120;
const WEEKS_SHOWN = 12;

/**
 * The laboratory's morning screen. Two questions only: what is coming at us,
 * and what is on fire. Anything that needs a filter belongs on the recall board
 * or the impact explorer instead.
 */
@Injectable()
export class DashboardStore {
  private readonly recalls = inject(RecallApiService);
  private readonly impact = inject(ImpactApiService);

  private readonly boardState = signal<readonly RecallEntry[]>([]);
  private readonly summaryState = signal<RecallSummary | null>(null);
  private readonly assessmentsState = signal<readonly ImpactView[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<RegistryError | null>(null);

  readonly summary = this.summaryState.asReadonly();
  readonly assessments = this.assessmentsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly overdue = computed(() => this.summaryState()?.overdue ?? 0);
  readonly unscheduled = computed(() => this.summaryState()?.unscheduled ?? 0);
  readonly dueSoon = computed(
    () => this.boardState().filter((entry) => entry.standing === 'DUE_THIS_WEEK').length,
  );
  readonly openAssessments = computed(() => this.assessmentsState().length);
  readonly highSeverity = computed(
    () => this.assessmentsState().filter((entry) => entry.severity === 'HIGH').length,
  );
  readonly pendingDispositions = computed(() =>
    this.assessmentsState().reduce((total, entry) => total + entry.pendingCount, 0),
  );

  /**
   * The next twelve weeks of recall work, one bar per week. Overdue items are
   * folded into the first bar rather than given a bar of their own, because
   * they are work for this week whatever their nominal date says.
   */
  readonly workloadByWeek = computed<readonly BarDatum[]>(() => {
    const buckets = new Array<number>(WEEKS_SHOWN).fill(0);
    for (const entry of this.boardState()) {
      if (entry.daysUntilDue > HORIZON_DAYS) {
        continue;
      }
      const week = Math.max(0, Math.floor(entry.daysUntilDue / 7));
      if (week < WEEKS_SHOWN) {
        buckets[week] += 1;
      }
    }
    return buckets.map((value, index) => ({
      label: index === 0 ? 'now' : `+${index}w`,
      value,
      tone: index === 0 && this.overdue() > 0 ? 'bad' : index <= 1 ? 'warn' : 'neutral',
    }));
  });

  readonly standingMix = computed<readonly DonutSlice[]>(() => {
    const counts = new Map<RecallStanding, number>();
    for (const entry of this.boardState()) {
      counts.set(entry.standing, (counts.get(entry.standing) ?? 0) + 1);
    }
    return [
      { label: 'Overdue', value: counts.get('OVERDUE') ?? 0, tone: 'bad' as const },
      { label: 'This week', value: counts.get('DUE_THIS_WEEK') ?? 0, tone: 'warn' as const },
      { label: 'This month', value: counts.get('DUE_THIS_MONTH') ?? 0, tone: 'neutral' as const },
      { label: 'Later', value: counts.get('SCHEDULED') ?? 0, tone: 'ok' as const },
      { label: 'Never done', value: this.unscheduled(), tone: 'quiet' as const },
    ].filter((slice) => slice.value > 0);
  });

  /** Where the pressure sits, so the lab knows which room to staff. */
  readonly loadByLocation = computed<readonly BarDatum[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of this.boardState()) {
      if (entry.daysUntilDue > 31) {
        continue;
      }
      const key = entry.locationCode ?? 'Unplaced';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, tone: 'neutral' as const }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  });

  readonly worstOffenders = computed(() =>
    [...this.boardState()]
      .filter((entry) => entry.standing === 'OVERDUE')
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 6),
  );

  readonly nothingWrong = computed(
    () => this.overdue() === 0 && this.openAssessments() === 0 && !this.loadingState(),
  );

  load(): void {
    this.loadingState.set(true);
    this.errorState.set(null);

    forkJoin({
      board: this.recalls.board(HORIZON_DAYS),
      summary: this.recalls.summary(HORIZON_DAYS),
      assessments: this.impact.open(),
    }).subscribe({
      next: ({ board, summary, assessments }) => {
        this.boardState.set(board);
        this.summaryState.set(summary);
        this.assessmentsState.set(assessments);
        this.loadingState.set(false);
      },
      error: (error: RegistryError) => {
        this.errorState.set(error);
        this.loadingState.set(false);
      },
    });
  }
}
