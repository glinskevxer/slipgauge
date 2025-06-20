import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { SessionService } from '@core/auth/session.service';
import { RegistryError } from '@core/errors/problem';

@Component({
  selector: 'sg-sign-in',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
})
export class SignInComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected submit(): void {
    if (this.busy() || !this.username().trim() || !this.password()) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);

    this.session.signIn(this.username().trim(), this.password()).subscribe({
      next: () => {
        this.busy.set(false);
        const next = this.route.snapshot.queryParamMap.get('next') ?? '/register';
        void this.router.navigateByUrl(next);
      },
      error: (error: RegistryError) => {
        this.busy.set(false);
        this.password.set('');
        this.problem.set(
          error.status === 401
            ? 'That username and password were not accepted.'
            : error.message,
        );
      },
    });
  }
}
