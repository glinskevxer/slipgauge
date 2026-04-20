import { Injectable, computed, inject, signal } from '@angular/core';

import { ImportApiService } from '@core/api/import-api.service';
import { RegistryError } from '@core/errors/problem';
import { LoadingState } from '@core/loading-state';
import { ImportReport, previewOf, rowCount, worthCommitting } from '@core/models/import.model';
import { NotificationService } from '@core/notifications/notification.service';

/**
 * The bulk import screen.
 *
 * <p>A file is checked before it can be committed, and choosing a different
 * file throws the last report away. Leaving an old report on screen beside a new
 * file is how somebody commits the wrong one.
 */
@Injectable()
export class ImportStore {
  private readonly api = inject(ImportApiService);
  private readonly notifications = inject(NotificationService);

  private readonly state = new LoadingState();
  private readonly fileState = signal<string | null>(null);
  private readonly nameState = signal<string | null>(null);
  private readonly reportState = signal<ImportReport | null>(null);

  readonly loading = this.state.loading;
  readonly error = this.state.error;
  readonly report = this.reportState.asReadonly();
  readonly fileName = this.nameState.asReadonly();

  readonly hasFile = computed(() => this.fileState() !== null);

  readonly preview = computed(() => {
    const text = this.fileState();
    return text === null ? [] : previewOf(text);
  });

  readonly rows = computed(() => {
    const text = this.fileState();
    return text === null ? 0 : rowCount(text);
  });

  /** True when a dry run has been done and it found something to add. */
  readonly canCommit = computed(() => worthCommitting(this.reportState()));

  take(name: string, text: string): void {
    this.nameState.set(name);
    this.fileState.set(text);
    this.reportState.set(null);
  }

  clear(): void {
    this.nameState.set(null);
    this.fileState.set(null);
    this.reportState.set(null);
  }

  check(): void {
    this.send(false);
  }

  commit(): void {
    this.send(true);
  }

  private send(commit: boolean): void {
    const text = this.fileState();

    if (text === null) {
      return;
    }
    this.state.track(
      this.api.run(text, commit),
      (report) => {
        this.reportState.set(report);
        if (commit) {
          this.notifications.success(
            `${report.created} instrument(s) added`,
            report.rejected > 0 ? `${report.rejected} row(s) were left out.` : undefined,
          );
        }
      },
      (error: RegistryError) => this.notifications.fromError(error, 'reading the file'),
    );
  }
}
