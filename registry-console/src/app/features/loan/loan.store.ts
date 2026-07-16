import { Injectable, computed, inject, signal } from '@angular/core';

import { IssueRequest, LoanApiService } from '@core/api/loan-api.service';
import { RegistryError } from '@core/errors/problem';
import { ItemCondition } from '@core/models/job.model';
import { LoanView, tallyOf, worstFirst } from '@core/models/loan.model';
import { LoadingState } from '@core/loading-state';
import { NotificationService } from '@core/notifications/notification.service';

/**
 * The loan book.
 *
 * <p>Opens on what is still out. The history is one query away and is what an
 * assessor asks for; the bench only ever wants to know what is not here.
 */
@Injectable()
export class LoanStore {
  private readonly api = inject(LoanApiService);
  private readonly notifications = inject(NotificationService);

  private readonly state = new LoadingState();
  private readonly loansState = signal<readonly LoanView[]>([]);
  private readonly includeReturnedState = signal(false);

  readonly loading = this.state.loading;
  readonly error = this.state.error;
  readonly includeReturned = this.includeReturnedState.asReadonly();

  readonly loans = computed(() => worstFirst(this.loansState()));
  readonly tally = computed(() => tallyOf(this.loansState()));
  readonly isEmpty = computed(() => !this.state.loading() && this.loansState().length === 0);

  load(): void {
    this.state.track(this.api.list(this.includeReturnedState()), (rows) =>
      this.loansState.set(rows),
    );
  }

  showReturned(includeReturned: boolean): void {
    this.includeReturnedState.set(includeReturned);
    this.load();
  }

  issue(request: IssueRequest): void {
    this.api.issue(request).subscribe({
      next: (loan) => {
        this.notifications.success(
          `${loan.assetTag} is out with ${loan.borrower}`,
          `Due back ${loan.dueBackOn}.`,
        );
        this.load();
      },
      error: (error: RegistryError) => this.notifications.fromError(error, 'issuing the loan'),
    });
  }

  bookBack(id: number, returnedOn: string, condition: ItemCondition, note?: string): void {
    this.api.bookBack(id, returnedOn, condition, note).subscribe({
      next: (loan) => {
        if (loan.cameBackWorse) {
          this.notifications.warning(
            `${loan.assetTag} came back ${loan.conditionBack?.toLowerCase()}`,
            'It is quarantined and a nonconformance has been raised.',
          );
        } else {
          this.notifications.info(`${loan.assetTag} is back in service`);
        }
        this.load();
      },
      error: (error: RegistryError) => this.notifications.fromError(error, 'booking it back in'),
    });
  }
}
