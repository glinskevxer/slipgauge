import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ItemCondition, conditionLabel } from '@core/models/job.model';
import {
  LoanView,
  conditionInWords,
  latenessInWords,
  latenessTone,
} from '@core/models/loan.model';
import { CountTileComponent } from '@shared/components/count-tile.component';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { LoanStore } from './loan.store';

/**
 * What is out of the laboratory and when it is due back.
 *
 * <p>The condition on the way back is a radio rather than a free field, and it
 * has no default. An instrument taken back without anybody choosing is an
 * instrument nobody looked at, and a default of serviceable would make that the
 * easiest answer.
 */
@Component({
  selector: 'sg-loan-book',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyStateComponent, CountTileComponent],
  providers: [LoanStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loan-book.component.html',
  styleUrl: './loan-book.component.scss',
})
export class LoanBookComponent implements OnInit {
  protected readonly store = inject(LoanStore);

  protected readonly conditions: readonly ItemCondition[] = [
    'SERVICEABLE',
    'DAMAGED',
    'INCOMPLETE',
    'CONTAMINATED',
  ];

  protected readonly openLoan = signal<number | null>(null);
  protected readonly returnCondition = signal<ItemCondition | null>(null);
  protected readonly returnNote = signal('');

  protected readonly conditionLabel = conditionLabel;
  protected readonly latenessTone = latenessTone;
  protected readonly latenessInWords = latenessInWords;
  protected readonly conditionInWords = conditionInWords;

  ngOnInit(): void {
    this.store.load();
  }

  protected toggle(loan: LoanView): void {
    this.openLoan.set(this.openLoan() === loan.id ? null : loan.id);
    this.returnCondition.set(null);
    this.returnNote.set('');
  }

  protected bookBack(loan: LoanView): void {
    const condition = this.returnCondition();

    if (!condition) {
      return;
    }
    this.store.bookBack(
      loan.id,
      new Date().toISOString().slice(0, 10),
      condition,
      this.returnNote() || undefined,
    );
    this.openLoan.set(null);
  }
}
