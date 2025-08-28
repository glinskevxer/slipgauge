import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService, ClassRequest } from '@core/api/admin-api.service';
import { ReferenceApiService } from '@core/api/reference-api.service';
import { RegistryError } from '@core/errors/problem';
import { Criticality, Discipline, InstrumentClassView } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';

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

const CRITICALITIES: readonly Criticality[] = ['ROUTINE', 'IMPORTANT', 'CRITICAL'];

/**
 * Maintaining the calibration regimes.
 *
 * <p>Editing happens in place in the table rather than in a dialog. There are
 * thirty classes and the job is nearly always comparing two of them and nudging
 * one, which a modal makes impossible.
 */
@Component({
  selector: 'sg-class-admin',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './class-admin.component.html',
  styleUrl: './class-admin.component.scss',
})
export class ClassAdminComponent implements OnInit {
  private readonly reference = inject(ReferenceApiService);
  private readonly admin = inject(AdminApiService);
  private readonly notifications = inject(NotificationService);

  protected readonly disciplines = DISCIPLINES;
  protected readonly criticalities = CRITICALITIES;

  protected readonly classes = signal<readonly InstrumentClassView[]>([]);
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal<ClassRequest | null>(null);
  protected readonly saving = signal(false);
  protected readonly filter = signal<Discipline | 'ALL'>('ALL');

  protected readonly shown = computed(() => {
    const discipline = this.filter();
    const all = [...this.classes()].sort((a, b) => a.code.localeCompare(b.code));
    return discipline === 'ALL'
      ? all
      : all.filter((entry) => entry.discipline === discipline);
  });

  protected readonly countsByDiscipline = computed(() => {
    const counts = new Map<Discipline, number>();
    for (const entry of this.classes()) {
      counts.set(entry.discipline, (counts.get(entry.discipline) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly draftInvalid = computed(() => {
    const draft = this.draft();
    if (!draft) {
      return false;
    }
    return (
      draft.minIntervalDays < 1 ||
      draft.minIntervalDays > draft.baseIntervalDays ||
      draft.baseIntervalDays > draft.maxIntervalDays ||
      !draft.name.trim()
    );
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.reference.classes().subscribe({
      next: (classes) => this.classes.set(classes),
      error: (error: RegistryError) =>
        this.notifications.fromError(error, 'Loading the class list'),
    });
  }

  protected edit(entry: InstrumentClassView): void {
    this.editing.set(entry.code);
    this.draft.set({
      code: entry.code,
      name: entry.name,
      discipline: entry.discipline,
      baseIntervalDays: entry.baseIntervalDays,
      minIntervalDays: entry.minIntervalDays,
      maxIntervalDays: entry.maxIntervalDays,
      criticality: entry.criticality,
    });
  }

  protected cancel(): void {
    this.editing.set(null);
    this.draft.set(null);
  }

  protected change(patch: Partial<ClassRequest>): void {
    this.draft.update((current) => (current ? { ...current, ...patch } : current));
  }

  protected save(): void {
    const draft = this.draft();
    const code = this.editing();
    if (!draft || !code || this.draftInvalid() || this.saving()) {
      return;
    }
    this.saving.set(true);

    this.admin.updateClass(code, draft).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.classes.update((current) =>
          current.map((entry) => (entry.code === updated.code ? updated : entry)),
        );
        this.cancel();
        this.notifications.success(
          `${updated.code} updated`,
          `Now ${updated.baseIntervalDays} days, between ${updated.minIntervalDays} and ${updated.maxIntervalDays}`,
        );
      },
      error: (error: RegistryError) => {
        this.saving.set(false);
        this.notifications.fromError(error, `Updating ${code}`);
      },
    });
  }

  /** How wide the class lets the engine range, as a readable sentence. */
  protected windowOf(entry: InstrumentClassView): string {
    const spread = entry.maxIntervalDays - entry.minIntervalDays;
    if (spread === 0) {
      return 'fixed';
    }
    return `${Math.round((spread / entry.baseIntervalDays) * 100)}% of base`;
  }
}
