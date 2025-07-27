import { ChangeDetectionStrategy, Component, OnInit, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { DriftChartComponent } from '@shared/charts/drift-chart.component';
import { StatusBadgeComponent } from '@shared/components/status-badge.component';
import { VerdictBadgeComponent } from '@shared/components/verdict-badge.component';
import { ChainTreeComponent } from '@features/traceability/chain-tree.component';
import { PointTableComponent } from '@features/certificate/point-table.component';
import { UsagePanelComponent } from '@features/usage/usage-panel.component';
import { EditPanelComponent } from './edit/edit-panel.component';
import { StatusActionsComponent } from './status/status-actions.component';
import { InstrumentStore } from './instrument.store';

type Tab = 'history' | 'interval' | 'traceability' | 'usage' | 'details';

@Component({
  selector: 'sg-instrument-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    StatusBadgeComponent,
    VerdictBadgeComponent,
    DriftChartComponent,
    PointTableComponent,
    ChainTreeComponent,
    UsagePanelComponent,
    EditPanelComponent,
    StatusActionsComponent,
  ],
  providers: [InstrumentStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './instrument-page.component.html',
  styleUrl: './instrument-page.component.scss',
})
export class InstrumentPageComponent implements OnInit {
  protected readonly store = inject(InstrumentStore);

  /** Bound from the route by withComponentInputBinding. */
  readonly id = input.required({ transform: numberAttribute });

  protected readonly tab = signal<Tab>('history');
  protected readonly tabs: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'history', label: 'Calibration history' },
    { key: 'interval', label: 'Interval' },
    { key: 'traceability', label: 'Traceability' },
    { key: 'usage', label: 'Usage' },
    { key: 'details', label: 'Details' },
  ];

  constructor() {
    // The route can change without the component being torn down when a user
    // follows a link from one instrument to another in the traceability tree.
    effect(() => this.store.load(this.id()));
  }

  ngOnInit(): void {
    this.tab.set('history');
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
  }
}
