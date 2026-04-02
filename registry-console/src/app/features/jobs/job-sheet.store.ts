import { Injectable, computed, inject, signal } from '@angular/core';

import { JobApiService, ReviewPreview } from '@core/api/job-api.service';
import { RegistryError } from '@core/errors/problem';
import { AcceptancePolicy, JobView, LineProgress } from '@core/models/job.model';
import { LoadingState } from '@core/loading-state';
import { NotificationService } from '@core/notifications/notification.service';

/**
 * One job, everything about it.
 *
 * <p>The preview is kept separate from the recorded review on purpose. They
 * look the same on the screen and they are not the same thing at all: one is
 * what the rules say today, the other is what somebody signed their name to,
 * and a screen that merged them would let a reviewer think they had recorded
 * something they had only looked at.
 */
@Injectable()
export class JobSheetStore {
  private readonly api = inject(JobApiService);
  private readonly notifications = inject(NotificationService);

  private readonly jobState = signal<JobView | null>(null);
  private readonly progressState = signal<readonly LineProgress[]>([]);
  private readonly previewState = signal<ReviewPreview | null>(null);
  private readonly policyState = signal<AcceptancePolicy | null>(null);
  private readonly state = new LoadingState();
  private readonly savingState = signal(false);

  readonly job = this.jobState.asReadonly();
  readonly progress = this.progressState.asReadonly();
  readonly preview = this.previewState.asReadonly();
  readonly policy = this.policyState.asReadonly();
  readonly loading = this.state.loading;
  readonly saving = this.savingState.asReadonly();
  readonly error = this.state.error;

  readonly review = computed(() => this.jobState()?.review ?? null);

  /** True while the job is waiting on somebody to review it. */
  readonly awaitingReview = computed(() => {
    const state = this.jobState()?.state;
    return state === 'RECEIVED' || state === 'UNDER_REVIEW';
  });

  /** Lines that still have no certificate behind them. */
  readonly outstanding = computed(() => this.progressState().filter((line) => !line.done));

  readonly certified = computed(() => this.progressState().filter((line) => line.done));

  /** True when the desk could mark the job finished right now. */
  readonly completable = computed(
    () => this.jobState()?.state === 'IN_PROGRESS' && this.outstanding().length === 0,
  );

  load(reference: string): void {
    this.state.track(this.api.get(reference), (job) => {
      this.jobState.set(job);
      this.loadProgress(reference);
      if (job.state === 'RECEIVED' || job.state === 'UNDER_REVIEW') {
        this.refreshPreview(reference);
      }
    });
  }

  /**
   * Re-runs the preview under a different decision rule. The rule changes what
   * the fourth clause says and nothing else, so this is the cheapest way for a
   * reviewer to see what agreeing to simple acceptance would actually cost.
   */
  proposePolicy(policy: AcceptancePolicy | null): void {
    this.policyState.set(policy);

    const reference = this.jobState()?.reference;
    if (reference) {
      this.refreshPreview(reference);
    }
  }

  record(methodReference: string | null, comment: string | null): void {
    const job = this.jobState();
    const policy = this.policyState();

    if (!job || !policy) {
      this.notifications.warning(
        'Choose a decision rule first',
        'A job cannot be accepted without one, and the customer has to have agreed it.',
      );
      return;
    }
    this.savingState.set(true);

    this.api
      .record(job.reference, {
        acceptancePolicy: policy,
        methodReference: methodReference ?? undefined,
        comment: comment ?? undefined,
      })
      .subscribe({
        next: (updated) => {
          this.jobState.set(updated);
          this.previewState.set(null);
          this.savingState.set(false);
          this.notifications.success(
            `${updated.reference} ${updated.state === 'DECLINED' ? 'was declined' : 'is accepted'}`,
          );
          this.loadProgress(updated.reference);
        },
        error: (error: RegistryError) => {
          this.savingState.set(false);
          this.notifications.fromError(error, `reviewing ${job.reference}`);
        },
      });
  }

  decline(reason: string): void {
    const job = this.jobState();

    if (!job) {
      return;
    }
    this.savingState.set(true);

    this.api.decline(job.reference, reason).subscribe({
      next: (updated) => {
        this.jobState.set(updated);
        this.previewState.set(null);
        this.savingState.set(false);
        this.notifications.info(`${updated.reference} was declined`);
      },
      error: (error: RegistryError) => {
        this.savingState.set(false);
        this.notifications.fromError(error, `declining ${job.reference}`);
      },
    });
  }

  move(action: string): void {
    const job = this.jobState();

    if (!job) {
      return;
    }
    this.savingState.set(true);

    this.api.move(job.reference, action).subscribe({
      next: (updated) => {
        this.jobState.set(updated);
        this.savingState.set(false);
        this.loadProgress(updated.reference);
      },
      error: (error: RegistryError) => {
        this.savingState.set(false);
        this.notifications.fromError(error, `moving ${job.reference}`);
      },
    });
  }

  private loadProgress(reference: string): void {
    this.api.progress(reference).subscribe({
      next: (lines) => this.progressState.set(lines),
      error: () => this.progressState.set([]),
    });
  }

  private refreshPreview(reference: string): void {
    this.api.preview(reference, this.policyState()).subscribe({
      next: (preview) => this.previewState.set(preview),
      error: () => this.previewState.set(null),
    });
  }
}
