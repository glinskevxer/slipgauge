import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { InstrumentApiService } from '@core/api/instrument-api.service';
import { SessionService } from '@core/auth/session.service';
import { NotificationService } from '@core/notifications/notification.service';
import { RegistryError } from '@core/errors/problem';
import {
  COMMANDS,
  Command,
  Match,
  looksLikeAssetTag,
  normaliseAssetTag,
  search,
} from './command.model';

/**
 * Opened with control or command and k, and closed with escape.
 *
 * <p>Typing an asset tag jumps straight to that instrument rather than showing
 * a command, which is the single most common thing anyone wants: somebody is
 * holding the instrument and reading the tag off it.
 *
 * <p>The highlight follows mousemove rather than mouseenter. A pointer left
 * parked where the last click landed fires mouseenter the instant the palette
 * opens underneath it, which quietly moved the highlight off the first result
 * before anybody had touched the mouse.
 */
@Component({
  selector: 'sg-command-palette',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly instruments = inject(InstrumentApiService);
  private readonly notifications = inject(NotificationService);

  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  protected readonly open = signal(false);
  protected readonly term = signal('');
  protected readonly cursor = signal(0);
  protected readonly jumping = signal(false);

  protected readonly matches = computed<readonly Match[]>(() =>
    search(COMMANDS, this.term(), this.session.roles()).slice(0, 8),
  );

  protected readonly tagJump = computed(() =>
    looksLikeAssetTag(this.term()) ? normaliseAssetTag(this.term()) : null,
  );

  protected readonly nothingFound = computed(
    () => this.term().trim().length > 0 && this.matches().length === 0 && !this.tagJump(),
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        queueMicrotask(() => this.box()?.nativeElement.focus());
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (!this.open()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.run();
    }
  }

  protected toggle(): void {
    this.open.update((current) => !current);
    if (this.open()) {
      this.term.set('');
      this.cursor.set(0);
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onTerm(value: string): void {
    this.term.set(value);
    this.cursor.set(0);
  }

  protected move(delta: number): void {
    const count = this.matches().length;
    if (count === 0) {
      return;
    }
    this.cursor.update((current) => (current + delta + count) % count);
  }

  protected run(): void {
    const tag = this.tagJump();
    if (tag) {
      this.jumpTo(tag);
      return;
    }
    const chosen = this.matches()[this.cursor()];
    if (chosen) {
      this.go(chosen.command);
    }
  }

  protected go(command: Command): void {
    this.close();
    if (command.route) {
      void this.router.navigate([...command.route]);
    }
  }

  protected highlighted(match: Match): ReadonlyArray<{ text: string; hit: boolean }> {
    const hits = new Set(match.hits);
    return [...match.command.title].map((character, index) => ({
      text: character,
      hit: hits.has(index),
    }));
  }

  private jumpTo(assetTag: string): void {
    this.jumping.set(true);
    this.instruments.byAssetTag(assetTag).subscribe({
      next: (instrument) => {
        this.jumping.set(false);
        this.close();
        void this.router.navigate(['/register', instrument.id]);
      },
      error: (error: RegistryError) => {
        this.jumping.set(false);
        if (error.isNotFound) {
          this.notifications.warning(`No instrument is tagged ${assetTag}`);
        } else {
          this.notifications.fromError(error, 'Looking that asset tag up');
        }
      },
    });
  }
}
