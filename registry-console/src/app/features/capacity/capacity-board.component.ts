import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { RecallApiService } from '@core/api/recall-api.service';
import { RegistryError } from '@core/errors/problem';
import { RecallEntry } from '@core/models/recall.model';
import { NotificationService } from '@core/notifications/notification.service';
import { Suggestion, Week, hoursFor, levelling, plan, utilisation } from './capacity.model';

const HORIZON_DAYS = 120;

/**
 * Where the recall work lands week by week, against what the laboratory can
 * actually get through. The suggestions are advisory: nothing here changes a
 * due date, it only says what could be brought forward.
 */
@Component({
  selector: 'sg-capacity-board',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './capacity-board.component.html',
  styleUrl: './capacity-board.component.scss',
})
export class CapacityBoardComponent implements OnInit {
  private readonly recalls = inject(RecallApiService);
  private readonly notifications = inject(NotificationService);

  protected readonly entries = signal<readonly RecallEntry[]>([]);
  protected readonly capacityHours = signal(24);
  protected readonly loading = signal(false);
  protected readonly openWeek = signal<number | null>(null);
  protected readonly showSuggestions = signal(true);

  protected readonly plan = computed(() =>
    plan(this.entries(), this.capacityHours(), 12, new Date()),
  );

  protected readonly suggestions = computed<readonly Suggestion[]>(() =>
    this.showSuggestions() ? levelling(this.plan()) : [],
  );

  protected readonly suggestedHours = computed(() =>
    this.suggestions().reduce((total, suggestion) => total + suggestion.hours, 0),
  );

  protected readonly peak = computed(() => this.plan().worstWeek?.hours ?? 0);

  protected readonly headroom = computed(
    () => this.capacityHours() * this.plan().weeks.length - this.plan().totalHours,
  );

  protected readonly hoursFor = hoursFor;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.recalls.board(HORIZON_DAYS).subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: (error: RegistryError) => {
        this.loading.set(false);
        this.notifications.fromError(error, 'Loading the recall board');
      },
    });
  }

  protected fill(week: Week): number {
    return Math.min(1, utilisation(week, this.capacityHours()));
  }

  protected over(week: Week): boolean {
    return week.hours > this.capacityHours();
  }

  protected spill(week: Week): number {
    return Math.max(0, week.hours - this.capacityHours());
  }

  protected toggleWeek(index: number): void {
    this.openWeek.update((current) => (current === index ? null : index));
  }

  protected suggestionsFor(index: number): readonly Suggestion[] {
    return this.suggestions().filter((suggestion) => suggestion.fromWeek === index);
  }

  protected setCapacity(hours: number): void {
    this.capacityHours.set(Math.max(1, Math.min(200, hours)));
  }
}
