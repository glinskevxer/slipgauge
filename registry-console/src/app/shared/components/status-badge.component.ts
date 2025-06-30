import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { InstrumentStatus, statusLabel } from '@core/models/instrument.model';
import { Tone } from '@shared/tone';

/**
 * The status pill used everywhere an instrument is listed. Colour is carried by
 * a data attribute rather than a class per status, so adding a status to the
 * service does not need a matching stylesheet edit here.
 */
@Component({
  selector: 'sg-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-tone]="tone()">{{ label() }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      padding: 1px var(--sg-space-2);
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: var(--sg-text-xs);
      font-weight: 600;
      white-space: nowrap;
    }

    .badge[data-tone='ok'] {
      background: var(--sg-pass-soft);
      color: var(--sg-pass);
      border-color: var(--sg-pass);
    }

    .badge[data-tone='neutral'] {
      background: var(--sg-accent-soft);
      color: var(--sg-accent);
      border-color: var(--sg-accent);
    }

    .badge[data-tone='bad'] {
      background: var(--sg-quarantine-soft);
      color: var(--sg-quarantine);
      border-color: var(--sg-quarantine);
    }

    .badge[data-tone='warn'] {
      background: var(--sg-marginal-soft);
      color: var(--sg-marginal);
      border-color: var(--sg-marginal);
    }

    .badge[data-tone='quiet'] {
      background: var(--sg-surface-sunken);
      color: var(--sg-ink-faint);
      border-color: var(--sg-border);
    }
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<InstrumentStatus>();

  protected readonly label = computed(() => statusLabel(this.status()));

  protected readonly tone = computed<Tone>(() => {
    switch (this.status()) {
      case 'IN_SERVICE':
        return 'ok';
      case 'IN_CALIBRATION':
        return 'neutral';
      case 'QUARANTINED':
        return 'bad';
      case 'UNDER_REPAIR':
      case 'ON_LOAN':
        return 'warn';
      case 'RETIRED':
        return 'quiet';
    }
  });
}
