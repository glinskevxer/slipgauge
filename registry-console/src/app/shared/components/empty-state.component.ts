import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'sg-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <p class="empty__headline">{{ headline() }}</p>
      @if (detail()) {
        <p class="empty__detail">{{ detail() }}</p>
      }
      @if (actionLabel()) {
        <button type="button" class="empty__action" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
  styles: `
    .empty {
      padding: var(--sg-space-7) var(--sg-space-5);
      text-align: center;
      color: var(--sg-ink-muted);
    }

    .empty__headline {
      margin: 0 0 var(--sg-space-2);
      font-weight: 600;
      color: var(--sg-ink);
    }

    .empty__detail {
      margin: 0 0 var(--sg-space-4);
      font-size: var(--sg-text-sm);
    }

    .empty__action {
      padding: var(--sg-space-2) var(--sg-space-4);
      border: 1px solid var(--sg-border-strong);
      border-radius: var(--sg-radius-sm);
      background: var(--sg-surface);
      color: var(--sg-ink);
      font: inherit;
      font-size: var(--sg-text-sm);
      cursor: pointer;
    }

    .empty__action:hover {
      background: var(--sg-surface-sunken);
    }
  `,
})
export class EmptyStateComponent {
  readonly headline = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();
}
