import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import {
  CompetenceCell,
  cellTone,
  daysUntil,
  depthOf,
  levelLabel,
  levelMark,
  remainingInWords,
  rowFor,
  spanInWords,
} from '@core/models/competence.model';
import { Discipline } from '@core/models/instrument.model';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { CompetenceStore } from './competence.store';

/**
 * Who is authorised for what.
 *
 * <p>A grid rather than a list, because the question the quality manager
 * actually has is never "what does Rachel hold", it is "is there anybody left
 * who can sign a torque certificate", and a list of grants cannot be read that
 * way at all.
 */
@Component({
  selector: 'sg-competence-matrix',
  standalone: true,
  imports: [DatePipe, EmptyStateComponent],
  providers: [CompetenceStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './competence-matrix.component.html',
  styleUrl: './competence-matrix.component.scss',
})
export class CompetenceMatrixComponent implements OnInit {
  protected readonly store = inject(CompetenceStore);

  protected readonly horizons = [30, 60, 90, 180] as const;

  protected readonly levelLabel = levelLabel;
  protected readonly levelMark = levelMark;
  protected readonly remainingInWords = remainingInWords;
  protected readonly spanInWords = spanInWords;

  ngOnInit(): void {
    this.store.load();
  }

  protected row(person: string): ReadonlyArray<CompetenceCell | null> {
    return rowFor(this.store.matrix(), person);
  }

  protected depth(discipline: Discipline): number {
    return depthOf(this.store.matrix(), discipline);
  }

  protected tone(cell: CompetenceCell | null): string {
    if (!cell) {
      return 'unknown';
    }
    return cellTone(cell, daysUntil(cell.expiresOn, this.store.today()));
  }

  /** The sentence that goes on a cell's title, which is where the detail lives. */
  protected cellTitle(person: string, discipline: Discipline, cell: CompetenceCell | null): string {
    if (!cell || cell.level === null) {
      return `${person} holds nothing for ${discipline.toLowerCase()}`;
    }
    const remaining = remainingInWords(daysUntil(cell.expiresOn, this.store.today()));

    return `${person}: ${levelLabel(cell.level)} for ${discipline.toLowerCase()}, ${remaining}`;
  }

  protected select(person: string): void {
    this.store.show(this.store.person() === person ? null : person);
  }
}
