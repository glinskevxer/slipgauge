import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { InstrumentApiService } from '@core/api/instrument-api.service';
import { RegistryError } from '@core/errors/problem';
import {
  InstrumentDetail,
  InstrumentStatus,
  InstrumentSummary,
  statusLabel,
  toUpdateRequest,
} from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import { downloadCsv, exportFileName, toCsv } from '@shared/export/csv';
import { REGISTER_COLUMNS } from '@shared/export/register-columns';
import {
  BulkAction,
  BulkOutcome,
  BulkPlan,
  groupFailures,
  planCustodianChange,
  planStatusChange,
  reachableFrom,
  summarise,
} from './bulk.model';

/**
 * The bar that appears once rows are selected.
 *
 * <p>Nothing is sent until the plan has been shown. Batch actions on a
 * register are the operations people regret, and half of them are avoided by
 * saying up front which rows the action will skip and why.
 */
@Component({
  selector: 'sg-bulk-bar',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bulk-bar.component.html',
  styleUrl: './bulk-bar.component.scss',
})
export class BulkBarComponent {
  private readonly api = inject(InstrumentApiService);
  private readonly notifications = inject(NotificationService);

  readonly selection = input.required<readonly InstrumentSummary[]>();
  readonly applied = output<void>();
  readonly cleared = output<void>();

  protected readonly action = signal<BulkAction | null>(null);
  protected readonly targetStatus = signal<InstrumentStatus | ''>('');
  protected readonly custodian = signal('');
  protected readonly running = signal(false);
  protected readonly outcome = signal<BulkOutcome | null>(null);

  protected readonly statusLabel = statusLabel;
  protected readonly reachable = computed(() => reachableFrom(this.selection()));

  protected readonly plan = computed<BulkPlan | null>(() => {
    switch (this.action()) {
      case 'STATUS':
        return this.targetStatus()
          ? planStatusChange(this.selection(), this.targetStatus() as InstrumentStatus)
          : null;
      case 'CUSTODIAN':
        return this.custodian().trim()
          ? planCustodianChange(this.selection(), this.custodian())
          : null;
      default:
        return null;
    }
  });

  protected readonly ready = computed(() => (this.plan()?.eligible.length ?? 0) > 0);

  protected readonly failureGroups = computed(() => {
    const outcome = this.outcome();
    return outcome ? groupFailures(outcome) : [];
  });

  protected choose(action: BulkAction): void {
    this.action.update((current) => (current === action ? null : action));
    this.outcome.set(null);
  }

  protected exportSelection(): void {
    const rows = this.selection();
    downloadCsv(toCsv(rows, REGISTER_COLUMNS), exportFileName('register selection'));
    this.notifications.success(`${rows.length} rows exported`);
    this.action.set(null);
  }

  protected apply(): void {
    const plan = this.plan();
    if (!plan || plan.eligible.length === 0 || this.running()) {
      return;
    }
    this.running.set(true);
    this.outcome.set(null);

    const calls = plan.eligible.map((instrument) =>
      this.callFor(instrument).pipe(
        map(() => ({ ok: true, assetTag: instrument.assetTag, message: '' })),
        catchError((error: RegistryError) =>
          of({ ok: false, assetTag: instrument.assetTag, message: error.message }),
        ),
      ),
    );

    forkJoin(calls).subscribe((results) => {
      this.running.set(false);
      const outcome: BulkOutcome = {
        succeeded: results.filter((result) => result.ok).length,
        failed: results
          .filter((result) => !result.ok)
          .map((result) => ({ assetTag: result.assetTag, message: result.message })),
      };
      this.outcome.set(outcome);

      if (outcome.failed.length === 0) {
        this.notifications.success(summarise(outcome));
        this.action.set(null);
      } else {
        this.notifications.warning(summarise(outcome), outcome.failed[0].message);
      }
      this.applied.emit();
    });
  }

  private callFor(instrument: InstrumentSummary): Observable<InstrumentDetail> {
    if (this.action() === 'STATUS') {
      return this.api.changeStatus(instrument.id, this.targetStatus() as InstrumentStatus);
    }
    // The custodian move goes through the update endpoint, which replaces the
    // whole editable half. Read the record first so nothing else is cleared.
    const custodian = this.custodian().trim();
    return this.api
      .byId(instrument.id)
      .pipe(
        switchMap((detail) =>
          this.api.update(detail.id, toUpdateRequest(detail, { custodian })),
        ),
      );
  }

  protected summary(): string {
    const outcome = this.outcome();
    return outcome ? summarise(outcome) : '';
  }
}
