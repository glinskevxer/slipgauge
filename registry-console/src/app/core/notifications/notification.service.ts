import { Injectable, computed, signal } from '@angular/core';

import { RegistryError } from '@core/errors/problem';
import { Notice, NoticeAction, NoticeTone, isDuplicateOf, notice } from './notification.model';

/** How many notices are shown before the oldest is pushed off. */
const CEILING = 5;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly noticesState = signal<readonly Notice[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly notices = this.noticesState.asReadonly();
  readonly hasFailure = computed(() =>
    this.noticesState().some((entry) => entry.tone === 'failure'),
  );
  readonly count = computed(() => this.noticesState().length);

  info(headline: string, detail?: string): void {
    this.raise(notice('info', headline, detail));
  }

  success(headline: string, detail?: string): void {
    this.raise(notice('success', headline, detail));
  }

  warning(headline: string, detail?: string, action?: NoticeAction): void {
    this.raise(notice('warning', headline, detail, action));
  }

  failure(headline: string, detail?: string, action?: NoticeAction): void {
    this.raise(notice('failure', headline, detail, action));
  }

  /**
   * Turns a service failure into something an operator can act on. The stale
   * record case gets a reload action rather than a sentence about optimistic
   * locking, which nobody on a bench has any use for.
   */
  fromError(error: RegistryError, whatWasBeingDone: string, retry?: () => void): void {
    if (error.code === 'registry/stale-record') {
      this.warning(
        'Somebody else changed this record',
        'Reload it and make your change again.',
        retry ? { label: 'Reload', run: retry } : undefined,
      );
      return;
    }
    if (error.code === 'registry/offline') {
      this.failure(
        'The registry cannot be reached',
        `${whatWasBeingDone} was not saved. Check the connection.`,
        retry ? { label: 'Try again', run: retry } : undefined,
      );
      return;
    }
    if (error.code === 'registry/forbidden') {
      this.warning('Your role does not allow that', whatWasBeingDone);
      return;
    }
    this.failure(`${whatWasBeingDone} failed`, error.message, retry
      ? { label: 'Try again', run: retry }
      : undefined);
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.noticesState.update((entries) => entries.filter((entry) => entry.id !== id));
  }

  dismissAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.noticesState.set([]);
  }

  countOf(tone: NoticeTone): number {
    return this.noticesState().filter((entry) => entry.tone === tone).length;
  }

  private raise(candidate: Notice): void {
    const current = this.noticesState();
    if (current.some((existing) => isDuplicateOf(candidate, existing))) {
      return;
    }

    const trimmed = current.length >= CEILING ? current.slice(current.length - CEILING + 1) : current;
    this.noticesState.set([...trimmed, candidate]);

    if (candidate.dismissAfterMs > 0) {
      this.timers.set(
        candidate.id,
        setTimeout(() => this.dismiss(candidate.id), candidate.dismissAfterMs),
      );
    }
  }
}
