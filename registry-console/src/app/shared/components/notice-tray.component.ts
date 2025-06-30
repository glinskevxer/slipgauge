import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationService } from '@core/notifications/notification.service';
import { toneIcon } from '@core/notifications/notification.model';

@Component({
  selector: 'sg-notice-tray',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tray" role="status" aria-live="polite">
      @for (entry of notifications.notices(); track entry.id) {
        <article class="notice" [attr.data-tone]="entry.tone">
          <span class="notice__icon" aria-hidden="true">{{ icon(entry.tone) }}</span>
          <div class="notice__body">
            <p class="notice__headline">{{ entry.headline }}</p>
            @if (entry.detail) {
              <p class="notice__detail">{{ entry.detail }}</p>
            }
          </div>
          @if (entry.action; as action) {
            <button type="button" class="notice__action" (click)="action.run()">
              {{ action.label }}
            </button>
          }
          <button
            type="button"
            class="notice__close"
            (click)="notifications.dismiss(entry.id)"
            aria-label="Dismiss"
          >
            ×
          </button>
        </article>
      }
    </div>
  `,
  styles: `
    .tray {
      position: fixed;
      right: var(--sg-space-4);
      bottom: var(--sg-space-4);
      z-index: 40;
      display: flex;
      flex-direction: column;
      gap: var(--sg-space-2);
      width: min(26rem, calc(100vw - 2rem));
    }

    .notice {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: start;
      gap: var(--sg-space-2);
      padding: var(--sg-space-3);
      background: var(--sg-surface);
      border: 1px solid var(--sg-border-strong);
      border-left-width: 4px;
      border-radius: var(--sg-radius-md);
      box-shadow: var(--sg-shadow-2);
    }

    .notice[data-tone='success'] {
      border-left-color: var(--sg-pass);
    }

    .notice[data-tone='warning'] {
      border-left-color: var(--sg-marginal);
    }

    .notice[data-tone='failure'] {
      border-left-color: var(--sg-fail);
    }

    .notice[data-tone='info'] {
      border-left-color: var(--sg-accent);
    }

    .notice__icon {
      width: 1.25rem;
      height: 1.25rem;
      border-radius: 50%;
      background: var(--sg-surface-sunken);
      text-align: center;
      font-size: var(--sg-text-xs);
      font-weight: 700;
      line-height: 1.25rem;
    }

    .notice__headline {
      margin: 0;
      font-size: var(--sg-text-sm);
      font-weight: 600;
    }

    .notice__detail {
      margin: 2px 0 0;
      color: var(--sg-ink-muted);
      font-size: var(--sg-text-sm);
    }

    .notice__action {
      padding: 2px var(--sg-space-2);
      border: 1px solid var(--sg-border-strong);
      border-radius: var(--sg-radius-sm);
      background: var(--sg-surface);
      color: var(--sg-ink);
      font: inherit;
      font-size: var(--sg-text-xs);
      cursor: pointer;
    }

    .notice__close {
      border: none;
      background: none;
      color: var(--sg-ink-faint);
      font-size: var(--sg-text-lg);
      line-height: 1;
      cursor: pointer;
    }
  `,
})
export class NoticeTrayComponent {
  protected readonly notifications = inject(NotificationService);
  protected readonly icon = toneIcon;
}
