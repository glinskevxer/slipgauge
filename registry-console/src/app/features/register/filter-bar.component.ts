import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { ReferenceApiService } from '@core/api/reference-api.service';
import { InstrumentQuery } from '@core/models/instrument-query.model';
import {
  Criticality,
  Discipline,
  InstrumentStatus,
  statusLabel,
} from '@core/models/instrument.model';

const DISCIPLINES: readonly Discipline[] = [
  'DIMENSIONAL',
  'ELECTRICAL',
  'MASS',
  'PRESSURE',
  'TEMPERATURE',
  'FLOW',
  'TORQUE',
  'TIME',
];

const STATUSES: readonly InstrumentStatus[] = [
  'IN_SERVICE',
  'IN_CALIBRATION',
  'QUARANTINED',
  'UNDER_REPAIR',
  'ON_LOAN',
  'RETIRED',
];

const CRITICALITIES: readonly Criticality[] = ['ROUTINE', 'IMPORTANT', 'CRITICAL'];

/**
 * The filter bar above the register.
 *
 * <p>It holds a draft of the query and only emits when the operator asks for
 * it. Filtering as you type looked responsive in a demo and was unusable on
 * the bench, where the register runs to several thousand rows and every
 * keystroke was a round trip.
 */
@Component({
  selector: 'sg-filter-bar',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.scss',
})
export class FilterBarComponent {
  private readonly reference = inject(ReferenceApiService);

  readonly applied = input.required<InstrumentQuery>();
  readonly busy = input(false);
  readonly search = output<InstrumentQuery>();
  readonly cleared = output<void>();

  protected readonly disciplines = DISCIPLINES;
  protected readonly statuses = STATUSES;
  protected readonly criticalities = CRITICALITIES;
  protected readonly expanded = signal(false);

  protected readonly text = signal('');
  protected readonly classCode = signal('');
  protected readonly locationCode = signal('');
  protected readonly referenceOnly = signal(false);
  protected readonly includeRetired = signal(false);
  protected readonly acquiredFrom = signal('');
  protected readonly acquiredTo = signal('');
  protected readonly chosenStatuses = signal<ReadonlySet<InstrumentStatus>>(new Set());
  protected readonly chosenDisciplines = signal<ReadonlySet<Discipline>>(new Set());
  protected readonly chosenCriticalities = signal<ReadonlySet<Criticality>>(new Set());

  protected readonly classes = toSignal(
    this.reference.classes().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly locations = toSignal(
    this.reference.locations().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly dateRangeInvalid = computed(() => {
    const from = this.acquiredFrom();
    const to = this.acquiredTo();
    return Boolean(from && to && from > to);
  });

  protected readonly statusLabelFor = statusLabel;

  protected toggleExpanded(): void {
    this.expanded.update((open) => !open);
  }

  protected toggleStatus(status: InstrumentStatus): void {
    this.chosenStatuses.set(toggled(this.chosenStatuses(), status));
  }

  protected toggleDiscipline(discipline: Discipline): void {
    this.chosenDisciplines.set(toggled(this.chosenDisciplines(), discipline));
  }

  protected toggleCriticality(criticality: Criticality): void {
    this.chosenCriticalities.set(toggled(this.chosenCriticalities(), criticality));
  }

  protected apply(): void {
    if (this.dateRangeInvalid()) {
      return;
    }
    this.search.emit(this.build());
  }

  protected clear(): void {
    this.text.set('');
    this.classCode.set('');
    this.locationCode.set('');
    this.referenceOnly.set(false);
    this.includeRetired.set(false);
    this.acquiredFrom.set('');
    this.acquiredTo.set('');
    this.chosenStatuses.set(new Set());
    this.chosenDisciplines.set(new Set());
    this.chosenCriticalities.set(new Set());
    this.cleared.emit();
  }

  /** Exposed for the spec, which asserts on the query rather than the markup. */
  build(): InstrumentQuery {
    const query: Record<string, unknown> = {};
    if (this.text().trim()) {query['text'] = this.text().trim();}
    if (this.chosenStatuses().size) {query['statuses'] = [...this.chosenStatuses()];}
    if (this.chosenDisciplines().size) {query['disciplines'] = [...this.chosenDisciplines()];}
    if (this.chosenCriticalities().size) {
      query['criticalities'] = [...this.chosenCriticalities()];
    }
    if (this.classCode()) {query['classCode'] = this.classCode();}
    if (this.locationCode()) {query['locationCode'] = this.locationCode();}
    if (this.referenceOnly()) {query['referenceOnly'] = true;}
    if (this.includeRetired()) {query['includeRetired'] = true;}
    if (this.acquiredFrom()) {query['acquiredFrom'] = this.acquiredFrom();}
    if (this.acquiredTo()) {query['acquiredTo'] = this.acquiredTo();}
    return query as InstrumentQuery;
  }
}

function toggled<T>(current: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(current);
  if (!next.delete(value)) {
    next.add(value);
  }
  return next;
}
