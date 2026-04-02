import { Injectable, computed, inject, signal } from '@angular/core';

import { EnvironmentApiService } from '@core/api/environment-api.service';
import { RegistryError } from '@core/errors/problem';
import {
  AffectedWork,
  EnvironmentLimitView,
  ExcursionView,
  RoomTrace,
  worstFirst,
} from '@core/models/environment.model';
import { LoadingState } from '@core/loading-state';
import { NotificationService } from '@core/notifications/notification.service';

/**
 * The room log screen.
 *
 * <p>The affected work is loaded only when an excursion is opened, not with the
 * list. Asking the service what every excursion put in question is one query
 * per row against the certificate table, and the answer is only interesting for
 * the one somebody is looking at.
 */
@Injectable()
export class EnvironmentStore {
  private readonly api = inject(EnvironmentApiService);
  private readonly notifications = inject(NotificationService);

  private readonly limitsState = signal<readonly EnvironmentLimitView[]>([]);
  private readonly excursionsState = signal<readonly ExcursionView[]>([]);
  private readonly roomState = signal<string | null>(null);
  private readonly unassessedOnlyState = signal(true);
  private readonly openedState = signal<ExcursionView | null>(null);
  private readonly affectedState = signal<AffectedWork | null>(null);
  private readonly traceState = signal<RoomTrace | null>(null);
  private readonly state = new LoadingState();

  readonly limits = this.limitsState.asReadonly();
  readonly room = this.roomState.asReadonly();
  readonly unassessedOnly = this.unassessedOnlyState.asReadonly();
  readonly opened = this.openedState.asReadonly();
  readonly affected = this.affectedState.asReadonly();
  readonly trace = this.traceState.asReadonly();
  readonly loading = this.state.loading;
  readonly error = this.state.error;

  readonly excursions = computed(() => worstFirst(this.excursionsState()));

  readonly major = computed(() =>
    this.excursionsState().filter((row) => row.severity === 'MAJOR'),
  );

  readonly stillOut = computed(() => this.excursionsState().filter((row) => row.open));

  readonly needingWork = computed(() =>
    this.excursionsState().filter((row) => row.putsWorkInQuestion && !row.assessed),
  );

  readonly isEmpty = computed(
    () => !this.state.loading() && this.excursionsState().length === 0,
  );

  /** How many certificates the opened excursion put in question. */
  readonly affectedCount = computed(() => this.affectedState()?.certificates.length ?? 0);

  readonly withdrawable = computed(
    () => this.affectedState()?.certificates.filter((row) => !row.withdrawn) ?? [],
  );

  load(): void {
    this.state.track(this.api.excursions(this.roomState(), this.unassessedOnlyState()), (rows) =>
      this.excursionsState.set(rows),
    );

    this.state.beside(
      this.api.limits(this.roomState() ?? undefined),
      (rows) => this.limitsState.set(rows),
      () => this.limitsState.set([]),
    );
  }

  forRoom(code: string | null): void {
    this.roomState.set(code && code.trim() ? code.trim().toUpperCase() : null);
    this.close();
    this.load();
  }

  showAll(unassessedOnly: boolean): void {
    this.unassessedOnlyState.set(unassessedOnly);
    this.load();
  }

  /** Opens one excursion, or closes it again when it is the one already open. */
  open(excursion: ExcursionView): void {
    if (this.openedState()?.id === excursion.id) {
      this.close();
      return;
    }
    this.openedState.set(excursion);
    this.refresh(excursion);
  }

  /**
   * Reads the detail again for the excursion that is already open.
   *
   * <p>Separate from open because open toggles, and reusing it after a
   * withdrawal shut the panel on the person who had just used it rather than
   * showing them what had happened.
   */
  private refresh(excursion: ExcursionView): void {
    this.affectedState.set(null);
    this.traceState.set(null);

    this.api.affected(excursion.id).subscribe({
      next: (work) => this.affectedState.set(work),
      error: (error: RegistryError) =>
        this.notifications.fromError(error, 'reading what that excursion touched'),
    });

    // A day either side, so the chart shows the room going out and coming back
    // rather than starting and ending on the excursion itself.
    const from = new Date(Date.parse(excursion.startedAt) - 86_400_000).toISOString();
    const to = new Date(
      Date.parse(excursion.endedAt ?? excursion.startedAt) + 86_400_000,
    ).toISOString();

    this.api.trace(excursion.locationCode, from, to).subscribe({
      next: (trace) => this.traceState.set(trace),
      error: () => this.traceState.set(null),
    });
  }

  close(): void {
    this.openedState.set(null);
    this.affectedState.set(null);
    this.traceState.set(null);
  }

  assess(finding: string): void {
    const excursion = this.openedState();

    if (!excursion || !finding.trim()) {
      return;
    }
    this.api.assess(excursion.id, finding.trim()).subscribe({
      next: () => {
        this.notifications.success(`Excursion ${excursion.id} assessed`);
        this.close();
        this.load();
      },
      error: (error: RegistryError) =>
        this.notifications.fromError(error, `assessing excursion ${excursion.id}`),
    });
  }

  withdrawAffected(reason: string): void {
    const excursion = this.openedState();

    if (!excursion || !reason.trim()) {
      return;
    }
    this.api.withdrawAffected(excursion.id, reason.trim()).subscribe({
      next: (result) => {
        this.notifications.warning(
          `${result.withdrawn} certificate(s) withdrawn`,
          result.alreadyWithdrawn > 0
            ? `${result.alreadyWithdrawn} had already gone.`
            : 'The recall dates behind them have been worked out again.',
        );
        this.refresh(excursion);
      },
      error: (error: RegistryError) =>
        this.notifications.fromError(error, 'withdrawing the affected work'),
    });
  }
}
