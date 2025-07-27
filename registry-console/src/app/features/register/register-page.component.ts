import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { StatusBadgeComponent } from '@shared/components/status-badge.component';
import { BulkBarComponent } from './bulk/bulk-bar.component';
import { FilterBarComponent } from './filter-bar.component';
import { SavedViewsComponent } from './saved-views.component';
import { RegisterView, viewToParams } from './query-url';
import { RegisterStore } from './register.store';

@Component({
  selector: 'sg-register-page',
  standalone: true,
  imports: [
    RouterLink,
    StatusBadgeComponent,
    EmptyStateComponent,
    FilterBarComponent,
    BulkBarComponent,
    SavedViewsComponent,
  ],
  providers: [RegisterStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss',
})
export class RegisterPageComponent implements OnInit {
  protected readonly store = inject(RegisterStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly columns = [
    { key: 'assetTag', label: 'Asset tag', sortable: true },
    { key: 'manufacturer', label: 'Maker', sortable: true },
    { key: 'model', label: 'Model', sortable: true },
    { key: 'serialNumber', label: 'Serial', sortable: true },
    { key: 'classCode', label: 'Class', sortable: true },
    { key: 'discipline', label: 'Discipline', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'locationCode', label: 'Location', sortable: false },
    { key: 'custodian', label: 'Custodian', sortable: false },
  ] as const;

  ngOnInit(): void {
    this.store.adopt(this.route.snapshot.queryParams);
  }

  protected openSavedView(view: RegisterView): void {
    this.store.adopt(viewToParams(view));
  }

  protected sortIndicator(column: string): string {
    const direction = this.store.directionFor(column);
    if (direction === 'asc') {return '↑';}
    if (direction === 'desc') {return '↓';}
    return '';
  }
}
