import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InstrumentApiService } from '@core/api/instrument-api.service';
import { SessionService } from '@core/auth/session.service';
import { RegistryError } from '@core/errors/problem';
import { InstrumentDetail } from '@core/models/instrument.model';
import { NotificationService } from '@core/notifications/notification.service';
import {
  StatusMove,
  confirmationFor,
  movesFrom,
  reasonIsUsable,
} from './status-change.model';

/**
 * The row of state changes on an instrument page.
 *
 * <p>Nothing happens on the first click. The move is described in a sentence
 * about this instrument, and the two that a customer may later ask about need a
 * reason typed before the button becomes usable.
 */
@Component({
  selector: 'sg-status-actions',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-actions.component.html',
  styleUrl: './status-actions.component.scss',
})
export class StatusActionsComponent {
  private readonly api = inject(InstrumentApiService);
  private readonly notifications = inject(NotificationService);
  private readonly session = inject(SessionService);

  readonly instrument = input.required<InstrumentDetail>();
  readonly moved = output<InstrumentDetail>();

  protected readonly chosen = signal<StatusMove | null>(null);
  protected readonly reason = signal('');
  protected readonly working = signal(false);

  protected readonly moves = computed(() => movesFrom(this.instrument().status));
  protected readonly mayMove = computed(() =>
    this.session.has('TECHNICIAN', 'METROLOGIST', 'ADMIN'),
  );

  protected readonly confirmation = computed(() => {
    const move = this.chosen();
    return move ? confirmationFor(this.instrument(), move) : '';
  });

  protected readonly canGo = computed(() => {
    const move = this.chosen();
    return (
      move !== null && !this.working() && this.mayMove() && reasonIsUsable(move, this.reason())
    );
  });

  protected choose(move: StatusMove): void {
    this.chosen.set(this.chosen()?.target === move.target ? null : move);
    this.reason.set('');
  }

  protected cancel(): void {
    this.chosen.set(null);
    this.reason.set('');
  }

  protected go(): void {
    const move = this.chosen();
    if (!move || !this.canGo()) {
      return;
    }
    this.working.set(true);

    const call =
      move.target === 'RETIRED'
        ? this.api.retire(this.instrument().id)
        : this.api.changeStatus(this.instrument().id, move.target);

    call.subscribe({
      next: (updated) => {
        this.working.set(false);
        this.moved.emit(updated);
        this.notifications.success(
          `${updated.assetTag} is now ${move.label.toLowerCase()}`,
          this.reason().trim() || undefined,
        );
        this.cancel();
      },
      error: (error: RegistryError) => {
        this.working.set(false);
        this.notifications.fromError(error, `Moving ${this.instrument().assetTag}`);
      },
    });
  }
}
