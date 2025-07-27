import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { SessionService } from './core/auth/session.service';

interface NavEntry {
  readonly path: string;
  readonly label: string;
  readonly hint: string;
}

/**
 * The frame every screen sits inside. It knows who is signed in and nothing
 * else, so a feature can be added without touching it.
 */
@Component({
  selector: 'sg-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly navigation = signal<readonly NavEntry[]>([
    { path: '/overview', label: 'Overview', hint: 'What is coming and what is on fire' },
    { path: '/register', label: 'Register', hint: 'Every instrument the lab holds' },
  ]);

  protected signOut(): void {
    this.session.signOut();
    void this.router.navigate(['/sign-in']);
  }
}
