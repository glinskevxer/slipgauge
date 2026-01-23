import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { SessionService } from './core/auth/session.service';
import { CommandPaletteComponent } from './shared/palette/command-palette.component';
import { LinkIndicatorComponent } from './shared/components/link-indicator.component';
import { NoticeTrayComponent } from './shared/components/notice-tray.component';

interface NavEntry {
  readonly path: string;
  readonly label: string;
  readonly hint: string;
}

@Component({
  selector: 'sg-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NoticeTrayComponent,
    CommandPaletteComponent,
    LinkIndicatorComponent,
  ],
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
    { path: '/jobs', label: 'Jobs', hint: 'Customer work that is still in the building' },
    { path: '/certificates/new', label: 'New sheet', hint: 'Enter a calibration result' },
    { path: '/recalls', label: 'Recalls', hint: 'What is due and what is already late' },
    { path: '/recalls/capacity', label: 'Capacity', hint: 'Whether the benches can take it' },
    { path: '/impact', label: 'Impact', hint: 'Where an out of tolerance result reached' },
  ]);

  protected readonly terminalNav = signal<readonly NavEntry[]>([
    { path: '/terminal', label: 'This terminal', hint: 'Theme, density and defaults' },
  ]);

  protected readonly qualityNav = signal<readonly NavEntry[]>([
    { path: '/refusals', label: 'Refusals', hint: 'What the registry turned away' },
    { path: '/competence', label: 'Competence', hint: 'Who is authorised for what' },
  ]);

  protected readonly adminNav = signal<readonly NavEntry[]>([
    { path: '/admin/classes', label: 'Admin', hint: 'Classes, locations and accounts' },
  ]);

  protected readonly labName = signal('Slipgauge Metrology');

  protected signOut(): void {
    this.session.signOut();
    void this.router.navigate(['/sign-in']);
  }
}
