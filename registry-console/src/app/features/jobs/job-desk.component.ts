import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  latenessInWords,
  latenessTone,
  nextMove,
  priorityLabel,
  stateLabel,
} from '@core/models/job.model';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { DeskLane, JobDeskStore } from './job-desk.store';

interface LaneTab {
  readonly key: DeskLane;
  readonly label: string;
  readonly hint: string;
}

/**
 * The job desk. The list the receiving bench has open all day.
 *
 * <p>It opens on everything that is still here rather than on a search box,
 * because the question the desk asks first is never "where is job so and so",
 * it is "what is going out today and what is not going to".
 */
@Component({
  selector: 'sg-job-desk',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyStateComponent],
  providers: [JobDeskStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-desk.component.html',
  styleUrl: './job-desk.component.scss',
})
export class JobDeskComponent implements OnInit {
  protected readonly store = inject(JobDeskStore);

  protected readonly lanes: readonly LaneTab[] = [
    { key: 'everything', label: 'Everything open', hint: 'Every job still in the building' },
    { key: 'toReview', label: 'To review', hint: 'Booked in and waiting on contract review' },
    { key: 'onTheBench', label: 'On the bench', hint: 'Work in progress' },
    { key: 'toDispatch', label: 'To send back', hint: 'Finished and waiting on the van' },
    { key: 'late', label: 'Late', hint: 'Past the date we promised' },
  ];

  protected readonly customerFilter = signal('');

  protected readonly stateLabel = stateLabel;
  protected readonly priorityLabel = priorityLabel;
  protected readonly latenessTone = latenessTone;
  protected readonly latenessInWords = latenessInWords;
  protected readonly nextMove = nextMove;

  ngOnInit(): void {
    this.store.load();
  }

  protected applyCustomer(value: string): void {
    this.customerFilter.set(value);
    this.store.forCustomer(value);
  }

  protected clearCustomer(): void {
    this.customerFilter.set('');
    this.store.forCustomer(null);
  }

  /** The count that belongs on a lane tab, or null when there is nothing to say. */
  protected countFor(lane: DeskLane): number | null {
    const summary = this.store.summary();

    if (!summary) {
      return null;
    }
    switch (lane) {
      case 'everything':
        return summary.open;
      case 'toReview':
        return summary.awaitingReview;
      case 'onTheBench':
        return summary.onTheBench;
      case 'toDispatch':
        return summary.readyToDispatch;
      case 'late':
        return summary.late;
      default:
        return null;
    }
  }
}
