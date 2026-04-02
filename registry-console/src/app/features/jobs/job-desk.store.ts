import { Injectable, computed, inject, signal } from '@angular/core';

import { JobApiService } from '@core/api/job-api.service';
import { RegistryError } from '@core/errors/problem';
import { JobDeskSummary, JobState, JobSummary, awaitingDesk } from '@core/models/job.model';
import { LoadingState } from '@core/loading-state';
import { NotificationService } from '@core/notifications/notification.service';

/** The tabs across the desk, and the state each one filters on. */
export type DeskLane = 'everything' | 'toReview' | 'onTheBench' | 'toDispatch' | 'late';

const LANE_STATE: Readonly<Record<DeskLane, JobState | undefined>> = {
  everything: undefined,
  toReview: 'RECEIVED',
  onTheBench: 'IN_PROGRESS',
  toDispatch: 'COMPLETED',
  late: undefined,
};

/**
 * The job desk.
 *
 * <p>The lanes are not four separate queries. Late work is a reading of the
 * same list rather than a state, and asking the service for it separately would
 * give the desk two counts of the same jobs that disagree the moment somebody
 * completes one.
 */
@Injectable()
export class JobDeskStore {
  private readonly api = inject(JobApiService);
  private readonly notifications = inject(NotificationService);

  private readonly jobsState = signal<readonly JobSummary[]>([]);
  private readonly summaryState = signal<JobDeskSummary | null>(null);
  private readonly laneState = signal<DeskLane>('everything');
  private readonly customerState = signal<string | null>(null);
  private readonly state = new LoadingState();
  private readonly totalState = signal(0);

  readonly summary = this.summaryState.asReadonly();
  readonly lane = this.laneState.asReadonly();
  readonly customer = this.customerState.asReadonly();
  readonly loading = this.state.loading;
  readonly error = this.state.error;
  readonly total = this.totalState.asReadonly();

  readonly jobs = computed(() => {
    const lane = this.laneState();
    const rows = this.jobsState();

    return lane === 'late' ? rows.filter((job) => job.open && job.lateness > 0) : rows;
  });

  /** Worst first: late, then closest to the promise, then oldest. */
  readonly worstFirst = computed(() =>
    [...this.jobs()].sort(
      (a, b) => b.lateness - a.lateness || a.promisedOn.localeCompare(b.promisedOn),
    ),
  );

  readonly waitingOnUs = computed(() => this.jobs().filter((job) => awaitingDesk(job.state)));

  readonly isEmpty = computed(() => !this.state.loading() && this.jobs().length === 0);

  load(): void {
    const lane = this.laneState();

    this.state.track(
      this.api.search({
        state: LANE_STATE[lane],
        customer: this.customerState() ?? undefined,
        size: 200,
      }),
      (page) => {
        this.jobsState.set(page.items);
        this.totalState.set(page.totalItems);
      },
    );

    this.state.beside(
      this.api.desk(),
      (summary) => this.summaryState.set(summary),
      () => this.summaryState.set(null),
    );
  }

  show(lane: DeskLane): void {
    if (lane === this.laneState()) {
      return;
    }
    this.laneState.set(lane);
    this.load();
  }

  forCustomer(code: string | null): void {
    this.customerState.set(code && code.trim() ? code.trim().toUpperCase() : null);
    this.load();
  }

  /**
   * Moves a job on and reloads. The reload is not optimism: completing a job
   * can fail on the certificates behind it, and a desk that had already crossed
   * the job off would be showing something the service refused.
   */
  move(reference: string, action: string): void {
    this.api.move(reference, action).subscribe({
      next: (job) => {
        this.notifications.info(`${job.reference} is now ${job.state.toLowerCase()}`);
        this.load();
      },
      error: (error: RegistryError) =>
        this.notifications.fromError(error, `moving ${reference}`, () => this.load()),
    });
  }
}
