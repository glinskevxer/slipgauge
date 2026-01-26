import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Tone } from '@shared/tone';

/**
 * A number with a word under it.
 *
 * <p>Three screens had grown their own copy of this, under two different names,
 * and they had drifted: the overview called it a tile and coloured its border,
 * the recall board called it a tally and coloured its text, and the job desk
 * had copied the recall board's version and then added a third colour to it. A
 * count on the overview and the same count on a board are the same thing and
 * have to look like it.
 *
 * <p>The link is optional. A tile that goes somewhere is a link, a tile that is
 * only a count is not, and making the ones that go nowhere into links with no
 * href was the other half of what had drifted.
 */
@Component({
  selector: 'sg-count-tile',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link(); as target) {
      <a class="tile" [attr.data-tone]="tone()" [routerLink]="target" [attr.title]="hint()">
        <span class="tile__count">{{ count() }}</span>
        <span class="tile__label">{{ label() }}</span>
      </a>
    } @else {
      <div class="tile" [attr.data-tone]="tone()" [attr.title]="hint()">
        <span class="tile__count">{{ count() }}</span>
        <span class="tile__label">{{ label() }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .tile {
      display: block;
      padding: var(--sg-space-3) var(--sg-space-4);
      background: var(--sg-surface);
      border: 1px solid var(--sg-border);
      border-radius: var(--sg-radius-lg);
      color: inherit;
      text-align: center;
      text-decoration: none;
    }

    a.tile:hover {
      border-color: var(--sg-border-strong);
      text-decoration: none;
    }

    .tile[data-tone='bad'] {
      border-color: var(--sg-fail);
    }

    .tile[data-tone='bad'] .tile__count {
      color: var(--sg-fail);
    }

    .tile[data-tone='warn'] {
      border-color: var(--sg-marginal);
    }

    .tile[data-tone='warn'] .tile__count {
      color: var(--sg-marginal);
    }

    .tile[data-tone='ok'] .tile__count {
      color: var(--sg-pass);
    }

    .tile__count {
      display: block;
      font-size: 1.75rem;
      font-weight: 700;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }

    .tile__label {
      display: block;
      color: var(--sg-ink-muted);
      font-size: var(--sg-text-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
  `,
})
export class CountTileComponent {
  readonly count = input.required<number>();
  readonly label = input.required<string>();
  readonly tone = input<Tone>('neutral');
  /** Where the tile goes when it is used, or null when it is only a count. */
  readonly link = input<string | null>(null);
  readonly hint = input<string | null>(null);
}
