import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  ImpactDisposition,
  ImpactKind,
  dispositionLabel,
  severityTone,
} from '@core/models/impact.model';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { ImpactStore } from './impact.store';

/**
 * The screen a quality manager lives in after a standard fails. The cascade is
 * laid out one column per hop from the failure, because the question being
 * asked is always "how far did this reach" before it is "what do I do".
 */
@Component({
  selector: 'sg-impact-explorer',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule, EmptyStateComponent],
  providers: [ImpactStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './impact-explorer.component.html',
  styleUrl: './impact-explorer.component.scss',
})
export class ImpactExplorerComponent implements OnInit {
  protected readonly store = inject(ImpactStore);

  protected readonly kinds: readonly ImpactKind[] = ['USAGE', 'CERTIFICATE', 'INSTRUMENT'];
  protected readonly dispositions: readonly ImpactDisposition[] = [
    'NO_EFFECT',
    'CUSTOMER_NOTIFIED',
    'RECALLED',
    'REWORKED',
    'ACCEPTED',
  ];

  protected readonly dispositionLabel = dispositionLabel;
  protected readonly severityTone = severityTone;

  protected readonly closedBy = signal('');
  protected readonly conclusion = signal('');
  protected readonly withdrawReason = signal('');

  ngOnInit(): void {
    this.store.loadOpen();
  }

  protected depthLabel(depth: number): string {
    if (depth === 0) {
      return 'Directly measured';
    }
    return `${depth} hop${depth === 1 ? '' : 's'} downstream`;
  }

  protected closeAssessment(): void {
    if (!this.closedBy().trim() || !this.conclusion().trim()) {
      return;
    }
    this.store.close(this.closedBy().trim(), this.conclusion().trim());
    this.closedBy.set('');
    this.conclusion.set('');
  }

  protected withdrawAll(): void {
    if (!this.withdrawReason().trim()) {
      return;
    }
    this.store.withdrawCaught(this.withdrawReason().trim());
    this.withdrawReason.set('');
  }
}
