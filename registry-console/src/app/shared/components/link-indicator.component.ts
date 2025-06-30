import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { OfflineQueueService } from '@core/offline/queue.service';

/**
 * Sits in the shell bar and only shows itself when there is something to say:
 * the link is down, or work is waiting to go out.
 */
@Component({
  selector: 'sg-link-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!queue.online() || queue.hasWork()) {
      <div class="link" [attr.data-state]="queue.online() ? 'holding' : 'offline'">
        <span class="link__dot" aria-hidden="true"></span>
        <span class="link__text">
          {{ queue.online() ? queue.summary() : 'The registry cannot be reached' }}
        </span>
        @if (queue.online() && queue.waiting() > 0) {
          <button
            type="button"
            class="link__action"
            [disabled]="queue.replaying()"
            (click)="queue.replay()"
          >
            {{ queue.replaying() ? 'Sending…' : 'Send now' }}
          </button>
        }
        @if (queue.stuck() > 0) {
          <button type="button" class="link__action" (click)="queue.discardParked()">
            Discard {{ queue.stuck() }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    .link {
      display: flex;
      align-items: center;
      gap: var(--sg-space-2);
      padding: 2px var(--sg-space-3);
      border-radius: 999px;
      font-size: var(--sg-text-xs);
      font-weight: 600;
    }

    .link[data-state='offline'] {
      background: var(--sg-fail-soft);
      color: var(--sg-fail);
    }

    .link[data-state='holding'] {
      background: var(--sg-marginal-soft);
      color: var(--sg-marginal);
    }

    .link__dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }

    .link__action {
      padding: 0 var(--sg-space-2);
      border: 1px solid currentColor;
      border-radius: 999px;
      background: none;
      color: inherit;
      font: inherit;
      font-size: var(--sg-text-xs);
      cursor: pointer;
    }

    .link__action:disabled {
      opacity: 0.6;
      cursor: default;
    }
  `,
})
export class LinkIndicatorComponent {
  protected readonly queue = inject(OfflineQueueService);
}
