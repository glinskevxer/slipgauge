import { Injectable, computed, inject, signal } from '@angular/core';

import { ReviewApiService } from '@core/api/review-api.service';
import { LoadingState } from '@core/loading-state';
import {
  ManagementReview,
  ReviewPeriod,
  isQuiet,
  lastCalendarYear,
  sectionsOf,
} from '@core/models/review.model';

/**
 * The management review pack.
 *
 * <p>Opens on the last complete calendar year rather than on a rolling twelve
 * months. The meeting minutes say "the 2025 review", and a pack that quietly
 * covered a different window every time somebody opened it would not match
 * them.
 */
@Injectable()
export class ReviewStore {
  private readonly api = inject(ReviewApiService);

  private readonly state = new LoadingState();
  private readonly packState = signal<ManagementReview | null>(null);
  private readonly periodState = signal<ReviewPeriod>(
    lastCalendarYear(new Date().toISOString().slice(0, 10)),
  );

  readonly loading = this.state.loading;
  readonly error = this.state.error;
  readonly pack = this.packState.asReadonly();
  readonly period = this.periodState.asReadonly();

  readonly sections = computed(() => {
    const held = this.packState();
    return held === null ? [] : sectionsOf(held);
  });

  readonly quiet = computed(() => {
    const held = this.packState();
    return held !== null && isQuiet(held);
  });

  load(): void {
    this.state.track(this.api.pack(this.periodState()), (pack) => this.packState.set(pack));
  }

  setPeriod(from: string, to: string): void {
    if (!from || !to || from > to) {
      return;
    }
    this.periodState.set({ from, to });
    this.load();
  }
}
