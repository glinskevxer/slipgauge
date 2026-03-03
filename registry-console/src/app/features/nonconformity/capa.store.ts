import { Injectable, computed, inject, signal } from '@angular/core';

import { NonconformityApiService, RaiseRequest } from '@core/api/nonconformity-api.service';
import { RegistryError } from '@core/errors/problem';
import {
  CapaStage,
  CapaSummary,
  NonconformanceView,
  awaitingStage,
  closeable,
} from '@core/models/nonconformity.model';
import { NotificationService } from '@core/notifications/notification.service';

/**
 * The nonconformance board.
 *
 * <p>The opened record is held as a reference rather than as a copy, so every
 * write refreshes the list and reads the opened one back out of it. Keeping a
 * second copy is how the panel and the row behind it ended up disagreeing about
 * which stage a record was at.
 */
@Injectable()
export class CapaStore {
  private readonly api = inject(NonconformityApiService);
  private readonly notifications = inject(NotificationService);

  private readonly recordsState = signal<readonly NonconformanceView[]>([]);
  private readonly summaryState = signal<CapaSummary | null>(null);
  private readonly stageState = signal<CapaStage | null>(null);
  private readonly includeClosedState = signal(false);
  private readonly openedRefState = signal<string | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<RegistryError | null>(null);

  readonly records = this.recordsState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly stage = this.stageState.asReadonly();
  readonly includeClosed = this.includeClosedState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly opened = computed(() => {
    const reference = this.openedRefState();

    return reference === null
      ? null
      : (this.recordsState().find((row) => row.reference === reference) ?? null);
  });

  readonly escalating = computed(() => this.recordsState().filter((row) => row.escalate));

  readonly awaitingMe = computed(() =>
    this.recordsState().filter((row) => row.open && row.owner === null),
  );

  readonly isEmpty = computed(() => !this.loadingState() && this.recordsState().length === 0);

  /** The stage the opened record is waiting for, or null when it is finished. */
  readonly nextStage = computed(() => {
    const record = this.opened();
    return record ? awaitingStage(record) : null;
  });

  readonly canClose = computed(() => {
    const record = this.opened();
    return record ? closeable(record) : false;
  });

  load(): void {
    this.loadingState.set(true);
    this.errorState.set(null);

    this.api.list(this.stageState(), this.includeClosedState()).subscribe({
      next: (rows) => {
        this.recordsState.set(rows);
        this.loadingState.set(false);
      },
      error: (error: RegistryError) => {
        this.errorState.set(error);
        this.loadingState.set(false);
      },
    });

    this.api.summary().subscribe({
      next: (summary) => this.summaryState.set(summary),
      error: () => this.summaryState.set(null),
    });
  }

  filterStage(stage: CapaStage | null): void {
    this.stageState.set(stage);
    this.load();
  }

  showClosed(includeClosed: boolean): void {
    this.includeClosedState.set(includeClosed);
    this.load();
  }

  open(reference: string): void {
    this.openedRefState.set(this.openedRefState() === reference ? null : reference);
  }

  raise(request: RaiseRequest): void {
    this.api.raise(request).subscribe({
      next: (raised) => {
        this.notifications.success(`${raised.reference} raised`, `Due ${raised.dueOn}.`);
        this.openedRefState.set(raised.reference);
        this.load();
      },
      error: (error: RegistryError) => this.notifications.fromError(error, 'raising it'),
    });
  }

  recordStage(text: string): void {
    const record = this.opened();
    const stage = this.nextStage();

    if (!record || !stage || !text.trim()) {
      return;
    }
    this.api.recordStage(record.reference, stage, text.trim()).subscribe({
      next: () => this.load(),
      error: (error: RegistryError) =>
        this.notifications.fromError(error, `recording ${stage.toLowerCase()}`),
    });
  }

  close(): void {
    const record = this.opened();

    if (!record) {
      return;
    }
    this.api.close(record.reference).subscribe({
      next: (closed) => {
        this.notifications.success(`${closed.reference} closed`);
        this.load();
      },
      error: (error: RegistryError) =>
        this.notifications.fromError(error, `closing ${record.reference}`),
    });
  }

  abandon(reason: string): void {
    const record = this.opened();

    if (!record || !reason.trim()) {
      return;
    }
    this.api.abandon(record.reference, reason.trim()).subscribe({
      next: () => {
        this.openedRefState.set(null);
        this.load();
      },
      error: (error: RegistryError) =>
        this.notifications.fromError(error, `abandoning ${record.reference}`),
    });
  }

  assign(owner: string, dueOn?: string): void {
    const record = this.opened();

    if (!record || !owner.trim()) {
      return;
    }
    this.api.assign(record.reference, owner.trim(), dueOn).subscribe({
      next: () => this.load(),
      error: (error: RegistryError) => this.notifications.fromError(error, 'assigning it'),
    });
  }
}
