import { Injectable, computed, inject, signal } from '@angular/core';

import { CompetenceApiService, GrantRequest } from '@core/api/competence-api.service';
import { RegistryError } from '@core/errors/problem';
import {
  CompetenceMatrix,
  CompetenceView,
  daysUntil,
  withoutAnApprover,
} from '@core/models/competence.model';
import { LoadingState } from '@core/loading-state';
import { NotificationService } from '@core/notifications/notification.service';

const EMPTY: CompetenceMatrix = { people: [], disciplines: [], cells: [] };

/**
 * The competence matrix and the renewal list beside it.
 *
 * <p>Today is held rather than read per cell. The matrix is redrawn on every
 * signal change and asking the clock inside a computed makes the whole grid
 * shift under somebody at midnight, which is a genuinely unpleasant way to find
 * out about it.
 */
@Injectable()
export class CompetenceStore {
  private readonly api = inject(CompetenceApiService);
  private readonly notifications = inject(NotificationService);

  private readonly matrixState = signal<CompetenceMatrix>(EMPTY);
  private readonly expiringState = signal<readonly CompetenceView[]>([]);
  private readonly personState = signal<string | null>(null);
  private readonly heldState = signal<readonly CompetenceView[]>([]);
  private readonly horizonState = signal(60);
  private readonly todayState = signal(new Date().toISOString().slice(0, 10));
  private readonly state = new LoadingState();

  readonly matrix = this.matrixState.asReadonly();
  readonly expiring = this.expiringState.asReadonly();
  readonly person = this.personState.asReadonly();
  readonly held = this.heldState.asReadonly();
  readonly horizon = this.horizonState.asReadonly();
  readonly today = this.todayState.asReadonly();
  readonly loading = this.state.loading;
  readonly error = this.state.error;

  readonly isEmpty = computed(
    () => !this.state.loading() && this.matrixState().people.length === 0,
  );

  /** Disciplines the laboratory works in with nobody able to sign anything off. */
  readonly uncovered = computed(() => withoutAnApprover(this.matrixState()));

  /** Anything already lapsed, which the horizon query will not return. */
  readonly lapsed = computed(() =>
    this.expiringState().filter(
      (row) => daysUntil(row.authorisedTo, this.todayState()) !== null && !row.live,
    ),
  );

  load(): void {
    this.state.track(this.api.matrix(), (matrix) => this.matrixState.set(matrix));
    this.loadExpiring();
  }

  setHorizon(days: number): void {
    this.horizonState.set(Math.max(7, Math.min(365, days)));
    this.loadExpiring();
  }

  /** Opens one person's authorisations under the matrix. */
  show(person: string | null): void {
    this.personState.set(person);

    if (!person) {
      this.heldState.set([]);
      return;
    }
    this.api.forPerson(person, true).subscribe({
      next: (held) => this.heldState.set(held),
      error: (error: RegistryError) => {
        this.heldState.set([]);
        this.notifications.fromError(error, `reading what ${person} holds`);
      },
    });
  }

  grant(request: GrantRequest): void {
    this.api.grant(request).subscribe({
      next: (granted) => {
        this.notifications.success(
          `${granted.person} is now ${granted.level.toLowerCase()} for ${granted.discipline.toLowerCase()}`,
        );
        this.load();
        if (this.personState() === granted.person) {
          this.show(granted.person);
        }
      },
      error: (error: RegistryError) => this.notifications.fromError(error, 'granting it'),
    });
  }

  withdraw(id: number, reason: string): void {
    this.api.withdraw(id, reason).subscribe({
      next: (withdrawn) => {
        this.notifications.info(`${withdrawn.person} no longer holds it`);
        this.load();
        if (this.personState()) {
          this.show(this.personState());
        }
      },
      error: (error: RegistryError) => this.notifications.fromError(error, 'withdrawing it'),
    });
  }

  private loadExpiring(): void {
    this.state.beside(
      this.api.expiring(this.horizonState()),
      (rows) => this.expiringState.set(rows),
      () => this.expiringState.set([]),
    );
  }
}
