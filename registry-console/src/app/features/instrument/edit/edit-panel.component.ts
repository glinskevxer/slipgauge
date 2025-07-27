import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { InstrumentApiService } from '@core/api/instrument-api.service';
import { ReferenceApiService } from '@core/api/reference-api.service';
import { SessionService } from '@core/auth/session.service';
import { RegistryError } from '@core/errors/problem';
import { InstrumentDetail } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import {
  EditDraft,
  changesBetween,
  consequencesOf,
  draftFrom,
  isUsable,
  problemsIn,
  toRequest,
} from './edit.model';

@Component({
  selector: 'sg-edit-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-panel.component.html',
  styleUrl: './edit-panel.component.scss',
})
export class EditPanelComponent {
  private readonly api = inject(InstrumentApiService);
  private readonly reference = inject(ReferenceApiService);
  private readonly notifications = inject(NotificationService);
  private readonly session = inject(SessionService);

  readonly instrument = input.required<InstrumentDetail>();
  readonly saved = output<InstrumentDetail>();

  protected readonly draft = signal<EditDraft>({
    description: '',
    rangeLow: null,
    rangeHigh: null,
    resolution: null,
    locationCode: '',
    custodian: '',
    referenceStandard: false,
  });
  protected readonly saving = signal(false);

  protected readonly locations = toSignal(
    this.reference.locations().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly problems = computed(() => problemsIn(this.draft()));
  protected readonly changes = computed(() => changesBetween(this.instrument(), this.draft()));
  protected readonly consequences = computed(() =>
    consequencesOf(this.instrument(), this.draft()),
  );
  protected readonly canSave = computed(
    () =>
      this.mayEdit() &&
      isUsable(this.draft()) &&
      this.changes().length > 0 &&
      !this.saving(),
  );
  protected readonly mayEdit = computed(() => this.session.has('METROLOGIST', 'ADMIN'));

  constructor() {
    effect(() => this.draft.set(draftFrom(this.instrument())));
  }

  protected change(patch: Partial<EditDraft>): void {
    this.draft.update((current) => ({ ...current, ...patch }));
  }

  protected messageFor(field: string): string | null {
    return this.problems().find((problem) => problem.field === field)?.message ?? null;
  }

  protected revert(): void {
    this.draft.set(draftFrom(this.instrument()));
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);

    this.api.update(this.instrument().id, toRequest(this.draft())).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.saved.emit(updated);
        this.notifications.success(
          `${updated.assetTag} updated`,
          this.changes().join(', '),
        );
      },
      error: (error: RegistryError) => {
        this.saving.set(false);
        this.notifications.fromError(error, `Updating ${this.instrument().assetTag}`, () =>
          this.revert(),
        );
      },
    });
  }
}
