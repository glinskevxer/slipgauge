import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Criticality } from '@core/models/instrument.model';
import { basisLabel, dueInWords, standingLabel, standingTone } from '@core/models/recall.model';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { RecallGrouping, RecallStore } from './recall.store';

@Component({
  selector: 'sg-recall-board',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyStateComponent],
  providers: [RecallStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recall-board.component.html',
  styleUrl: './recall-board.component.scss',
})
export class RecallBoardComponent implements OnInit {
  protected readonly store = inject(RecallStore);

  protected readonly horizons = [14, 30, 60, 90, 180, 365] as const;
  protected readonly groupings: ReadonlyArray<{ key: RecallGrouping; label: string }> = [
    { key: 'standing', label: 'When it is due' },
    { key: 'location', label: 'Location' },
    { key: 'custodian', label: 'Custodian' },
    { key: 'class', label: 'Class' },
  ];
  protected readonly criticalities: readonly Criticality[] = [
    'CRITICAL',
    'IMPORTANT',
    'ROUTINE',
  ];

  protected readonly standingLabel = standingLabel;
  protected readonly standingTone = standingTone;
  protected readonly basisLabel = basisLabel;
  protected readonly dueInWords = dueInWords;

  ngOnInit(): void {
    this.store.load();
  }

  protected groupHeading(key: string): string {
    const grouping = this.store.grouping();
    if (grouping === 'standing') {
      return standingLabel(key as never);
    }
    return key;
  }
}
