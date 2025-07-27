import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { UsageApiService } from '@core/api/usage-api.service';
import { RegistryError } from '@core/errors/problem';
import { NotificationService } from '@core/notifications/notification.service';
import { OfflineQueueService } from '@core/offline/queue.service';
import {
  LogUsageRequest,
  UsageView,
  byWorkOrder,
  isUntraceable,
  totalReadings,
  usageSpan,
} from '@core/models/usage.model';

/**
 * The usage tab on an instrument. Logging a use is the single most frequent
 * thing anyone does on a bench terminal, so the form is four fields and the
 * technician's name is remembered between entries.
 */
@Component({
  selector: 'sg-usage-panel',
  standalone: true,
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usage-panel.component.html',
  styleUrl: './usage-panel.component.scss',
})
export class UsagePanelComponent {
  private readonly api = inject(UsageApiService);
  private readonly notifications = inject(NotificationService);
  private readonly queue = inject(OfflineQueueService);

  readonly instrumentId = input.required<number>();
  readonly assetTag = input.required<string>();
  readonly usable = input(true);

  protected readonly uses = signal<readonly UsageView[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  protected readonly usedOn = signal(new Date().toISOString().slice(0, 10));
  protected readonly usedBy = signal('');
  protected readonly workOrder = signal('');
  protected readonly customer = signal('');
  protected readonly purpose = signal('');
  protected readonly readingCount = signal<number | null>(1);

  protected readonly grouped = computed(() => byWorkOrder(this.uses()));
  protected readonly readings = computed(() => totalReadings(this.uses()));
  protected readonly span = computed(() => usageSpan(this.uses()));
  protected readonly untraceableCount = computed(
    () => this.uses().filter(isUntraceable).length,
  );

  protected readonly wouldBeUntraceable = computed(() =>
    isUntraceable({
      assetTag: this.assetTag(),
      usedOn: this.usedOn(),
      usedBy: this.usedBy(),
      workOrder: this.workOrder(),
      customer: this.customer(),
    }),
  );

  protected readonly canSubmit = computed(
    () => this.usable() && !this.saving() && this.usedBy().trim().length > 0,
  );

  constructor() {
    effect(() => this.load(this.instrumentId()));
  }

  private load(instrumentId: number): void {
    this.loading.set(true);
    this.api.forInstrument(instrumentId, 0, 50).subscribe({
      next: (page) => {
        this.uses.set(page.items);
        this.loading.set(false);
      },
      error: (error: RegistryError) => {
        this.loading.set(false);
        this.notifications.fromError(error, 'Loading the usage log');
      },
    });
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);

    const request = this.toRequest();
    this.api.log(request).subscribe({
      next: (logged) => {
        this.saving.set(false);
        this.uses.update((current) => [logged, ...current]);
        this.workOrder.set('');
        this.customer.set('');
        this.purpose.set('');
        this.readingCount.set(1);
        this.notifications.success(
          'Use recorded',
          `${logged.assetTag} on ${logged.workOrder ?? 'no work order'}`,
        );
      },
      error: (error: RegistryError) => {
        this.saving.set(false);
        if (error.code === 'registry/offline') {
          // A usage entry is safe to replay, so hold it rather than lose it.
          this.queue.hold('USAGE', request, `${this.assetTag()} on ${request.workOrder ?? 'no work order'}`);
          this.workOrder.set('');
          this.customer.set('');
          return;
        }
        this.notifications.fromError(error, 'Recording the use');
      },
    });
  }

  private toRequest(): LogUsageRequest {
    return {
      assetTag: this.assetTag(),
      usedOn: this.usedOn(),
      usedBy: this.usedBy().trim(),
      workOrder: this.workOrder().trim() || null,
      customer: this.customer().trim() || null,
      purpose: this.purpose().trim() || null,
      readingCount: this.readingCount() ?? 1,
    };
  }
}
