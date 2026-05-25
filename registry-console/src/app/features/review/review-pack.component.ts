import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import { periodInWords } from '@core/models/review.model';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { ReviewStore } from './review.store';

/**
 * The management review pack, on a screen and on paper.
 *
 * <p>Laid out to be printed. The meeting happens round a table with the pack
 * in front of everybody, and a screen that only works on a screen means
 * somebody retypes it into a document the night before.
 */
@Component({
  selector: 'sg-review-pack',
  standalone: true,
  imports: [DatePipe, EmptyStateComponent],
  providers: [ReviewStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review-pack.component.html',
  styleUrl: './review-pack.component.scss',
})
export class ReviewPackComponent implements OnInit {
  protected readonly store = inject(ReviewStore);

  protected readonly periodInWords = periodInWords;

  ngOnInit(): void {
    this.store.load();
  }

  protected apply(from: string, to: string): void {
    this.store.setPeriod(from, to);
  }

  protected print(): void {
    window.print();
  }
}
