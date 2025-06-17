import { ErrorHandler, Injectable, inject } from '@angular/core';

import { NotificationService } from '@core/notifications/notification.service';
import { RegistryError } from './problem';

/**
 * The last catch.
 *
 * <p>Angular's default handler writes to the console and stops. On a bench
 * terminal nobody has the console open, so an error thrown inside a component
 * looked exactly like the screen quietly not working. Every one of them now
 * reaches the operator, with the correlation id if there is one, because the
 * next thing that happens is somebody ringing the metrology office.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notifications = inject(NotificationService);

  /** Repeats of the same fault inside this window are swallowed. */
  private static readonly QUIET_MS = 5000;

  private lastMessage = '';
  private lastAt = 0;

  handleError(error: unknown): void {
    const message = describe(error);

    // A failure inside a change detection loop arrives dozens of times a second.
    const now = Date.now();
    if (message === this.lastMessage && now - this.lastAt < GlobalErrorHandler.QUIET_MS) {
      return;
    }
    this.lastMessage = message;
    this.lastAt = now;

    if (error instanceof RegistryError) {
      // Already reported wherever it was caught; this is the path nothing handled.
      this.notifications.fromError(error, 'That request');
    } else {
      this.notifications.failure(
        'Something went wrong on this screen',
        `${message} Reload the page, and tell the metrology office if it keeps happening.`,
      );
    }

    // Still write it out: a developer with the console open wants the stack.
    console.error(error);
  }
}

function describe(error: unknown): string {
  if (error instanceof RegistryError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected fault.';
}
