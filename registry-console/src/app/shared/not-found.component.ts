import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'sg-not-found',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="missing">
      <h1>No such page</h1>
      <p>The address you followed is not part of the registry console.</p>
      <a routerLink="/register">Back to the register</a>
    </section>
  `,
  styles: `
    .missing {
      max-width: 34rem;
      margin: var(--sg-space-7) auto;
      padding: var(--sg-space-6);
      background: var(--sg-surface);
      border: 1px solid var(--sg-border);
      border-radius: var(--sg-radius-lg);
      text-align: center;
    }

    p {
      color: var(--sg-ink-muted);
    }
  `,
})
export class NotFoundComponent {}
