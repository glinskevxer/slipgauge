import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import {
  CapaStage,
  NonconformanceView,
  latenessInWords,
  latenessTone,
  progressOf,
  severityTone,
  sourceLabel,
  stageLabel,
} from '@core/models/nonconformity.model';
import { CountTileComponent } from '@shared/components/count-tile.component';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { CapaStore } from './capa.store';

/**
 * Nonconformances and what is being done about them.
 *
 * <p>One panel, one record, and only ever the next stage on it. Showing all
 * four boxes at once invites somebody to fill in a corrective action before
 * anybody has written down a cause, which is the exact failure the stage order
 * exists to stop.
 */
@Component({
  selector: 'sg-capa-board',
  standalone: true,
  imports: [DatePipe, EmptyStateComponent, CountTileComponent],
  providers: [CapaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './capa-board.component.html',
  styleUrl: './capa-board.component.scss',
})
export class CapaBoardComponent implements OnInit {
  protected readonly store = inject(CapaStore);

  protected readonly stages: readonly CapaStage[] = [
    'RAISED',
    'CONTAINED',
    'CAUSE_FOUND',
    'ACTION_TAKEN',
    'EFFECTIVENESS_CHECKED',
  ];

  protected readonly answer = signal('');
  protected readonly abandonReason = signal('');
  protected readonly owner = signal('');

  protected readonly stageLabel = stageLabel;
  protected readonly sourceLabel = sourceLabel;
  protected readonly severityTone = severityTone;
  protected readonly latenessInWords = latenessInWords;
  protected readonly latenessTone = latenessTone;

  ngOnInit(): void {
    this.store.load();
  }

  protected progressPercent(record: NonconformanceView): number {
    return Math.round(progressOf(record) * 100);
  }

  protected countFor(stage: CapaStage): number {
    return this.store.summary()?.byStage[stage] ?? 0;
  }

  /**
   * Named for what it does rather than for the noun, because the template loops
   * over `record` and a method of the same name is shadowed by the loop
   * variable inside the block that uses it.
   */
  protected recordAnswer(): void {
    this.store.recordStage(this.answer());
    this.answer.set('');
  }

  protected abandon(): void {
    this.store.abandon(this.abandonReason());
    this.abandonReason.set('');
  }

  protected assign(): void {
    this.store.assign(this.owner());
    this.owner.set('');
  }

  /** The four written answers, in order, for the record that is open. */
  protected answers(
    record: NonconformanceView,
  ): ReadonlyArray<{ readonly label: string; readonly text: string | null; readonly on: string | null }> {
    return [
      { label: 'Containment', text: record.containment, on: record.containedOn },
      { label: 'Root cause', text: record.rootCause, on: record.causeFoundOn },
      { label: 'Corrective action', text: record.correctiveAction, on: record.actionTakenOn },
      { label: 'Effectiveness', text: record.effectiveness, on: record.effectivenessOn },
    ];
  }
}
