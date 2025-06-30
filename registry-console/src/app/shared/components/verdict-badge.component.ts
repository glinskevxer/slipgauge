import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Verdict, verdictLabel, verdictTone } from '@core/models/calibration.model';

@Component({
  selector: 'sg-verdict-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="verdict" [attr.data-tone]="tone()">{{ label() }}</span>`,
  styles: `
    .verdict {
      display: inline-block;
      padding: 1px var(--sg-space-2);
      border-radius: var(--sg-radius-sm);
      border: 1px solid transparent;
      font-size: var(--sg-text-xs);
      font-weight: 600;
      white-space: nowrap;
    }

    .verdict[data-tone='ok'] {
      background: var(--sg-pass-soft);
      color: var(--sg-pass);
      border-color: var(--sg-pass);
    }

    .verdict[data-tone='warn'] {
      background: var(--sg-marginal-soft);
      color: var(--sg-marginal);
      border-color: var(--sg-marginal);
    }

    .verdict[data-tone='bad'] {
      background: var(--sg-fail-soft);
      color: var(--sg-fail);
      border-color: var(--sg-fail);
    }

    .verdict[data-tone='unknown'] {
      background: var(--sg-surface-sunken);
      color: var(--sg-ink-muted);
      border-color: var(--sg-border-strong);
    }
  `,
})
export class VerdictBadgeComponent {
  readonly verdict = input.required<Verdict>();

  protected readonly label = computed(() => verdictLabel(this.verdict()));
  protected readonly tone = computed(() => verdictTone(this.verdict()));
}
