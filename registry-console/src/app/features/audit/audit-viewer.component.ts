import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuditApiService } from '@core/api/audit-api.service';
import { RegistryError } from '@core/errors/problem';
import {
  AuditLine,
  RefusalGroup,
  groupRefusals,
  outcomeTone,
  suspicious,
} from '@core/models/audit.model';
import { NotificationService } from '@core/notifications/notification.service';
import { EmptyStateComponent } from '@shared/components/empty-state.component';

/**
 * The refusal log, grouped.
 *
 * <p>A flat list of every denied request is unreadable after a week. What a
 * quality manager is looking for is a shape: the same person failing the same
 * thing repeatedly. So the default view groups, and the individual lines are
 * one click away.
 */
@Component({
  selector: 'sg-audit-viewer',
  standalone: true,
  imports: [FormsModule, DatePipe, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-viewer.component.html',
  styleUrl: './audit-viewer.component.scss',
})
export class AuditViewerComponent implements OnInit {
  private readonly api = inject(AuditApiService);
  private readonly notifications = inject(NotificationService);

  protected readonly windows = [1, 7, 30, 90] as const;

  protected readonly lines = signal<readonly AuditLine[]>([]);
  protected readonly days = signal(7);
  protected readonly loading = signal(false);
  protected readonly expanded = signal<string | null>(null);
  protected readonly actorFilter = signal('');

  protected readonly outcomeTone = outcomeTone;

  protected readonly groups = computed(() => {
    const needle = this.actorFilter().trim().toLowerCase();
    const all = groupRefusals(this.lines());
    return needle
      ? all.filter((group) => group.actor.toLowerCase().includes(needle))
      : all;
  });

  protected readonly worrying = computed(() => suspicious(this.groups()));
  protected readonly totalRefusals = computed(() =>
    this.groups().reduce((total, group) => total + group.count, 0),
  );
  protected readonly distinctActors = computed(
    () => new Set(this.groups().map((group) => group.actor)).size,
  );

  ngOnInit(): void {
    this.load();
  }

  protected setWindow(days: number): void {
    this.days.set(days);
    this.load();
  }

  protected toggle(group: RefusalGroup): void {
    const key = `${group.actor}::${group.action}`;
    this.expanded.update((current) => (current === key ? null : key));
  }

  protected isExpanded(group: RefusalGroup): boolean {
    return this.expanded() === `${group.actor}::${group.action}`;
  }

  protected isWorrying(group: RefusalGroup): boolean {
    return this.worrying().includes(group);
  }

  private load(): void {
    this.loading.set(true);
    this.api.refusals(this.days()).subscribe({
      next: (lines) => {
        this.lines.set(lines);
        this.loading.set(false);
      },
      error: (error: RegistryError) => {
        this.loading.set(false);
        this.notifications.fromError(error, 'Loading the refusal log');
      },
    });
  }
}
