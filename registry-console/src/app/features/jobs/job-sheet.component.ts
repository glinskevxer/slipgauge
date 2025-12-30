import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  AcceptancePolicy,
  conditionLabel,
  latenessInWords,
  latenessTone,
  nextMove,
  outcomeLabel,
  priorityLabel,
  reviewClauses,
  serviceLabel,
  stateLabel,
} from '@core/models/job.model';
import { EmptyStateComponent } from '@shared/components/empty-state.component';
import { JobSheetStore } from './job-sheet.store';

interface PolicyChoice {
  readonly key: AcceptancePolicy;
  readonly label: string;
  readonly hint: string;
}

/**
 * One job: what came in, what contract review said, and where every line has
 * got to.
 *
 * <p>This is the screen the reviewer works from, so the review panel sits above
 * the lines rather than under them. A reviewer who has to scroll past twelve
 * items to find the findings will stop reading the findings.
 */
@Component({
  selector: 'sg-job-sheet',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyStateComponent],
  providers: [JobSheetStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-sheet.component.html',
  styleUrl: './job-sheet.component.scss',
})
export class JobSheetComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  protected readonly store = inject(JobSheetStore);

  protected readonly policies: readonly PolicyChoice[] = [
    {
      key: 'MANAGED_RISK',
      label: 'Managed risk',
      hint: 'The guard band grows as the ratio worsens. What we quote by default.',
    },
    {
      key: 'STRINGENT',
      label: 'Stringent',
      hint: 'The whole expanded uncertainty comes off the limit. We carry the risk.',
    },
    {
      key: 'SHARED_RISK',
      label: 'Simple acceptance',
      hint: 'No guard band. The customer carries the risk on a borderline reading.',
    },
  ];

  protected readonly methodReference = signal('');
  protected readonly comment = signal('');
  protected readonly declineReason = signal('');

  protected readonly stateLabel = stateLabel;
  protected readonly priorityLabel = priorityLabel;
  protected readonly serviceLabel = serviceLabel;
  protected readonly conditionLabel = conditionLabel;
  protected readonly outcomeLabel = outcomeLabel;
  protected readonly reviewClauses = reviewClauses;
  protected readonly latenessTone = latenessTone;
  protected readonly latenessInWords = latenessInWords;
  protected readonly nextMove = nextMove;

  ngOnInit(): void {
    const reference = this.route.snapshot.paramMap.get('reference');

    if (reference) {
      this.store.load(reference);
    }
  }

  protected choose(policy: string): void {
    this.store.proposePolicy((policy || null) as AcceptancePolicy | null);
  }

  protected record(): void {
    this.store.record(this.methodReference() || null, this.comment() || null);
  }

  protected decline(): void {
    const reason = this.declineReason().trim();

    if (reason) {
      this.store.decline(reason);
    }
  }

  /** How a finding reads on the panel: severity first, because that is the sort. */
  protected severityClass(severity: string): string {
    return `finding--${severity.toLowerCase()}`;
  }
}
