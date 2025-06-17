import { Injectable, computed, inject, signal } from '@angular/core';
import { concat, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { RegistryHttpService } from '@core/api/registry-http.service';
import { RegistryError } from '@core/errors/problem';
import { NotificationService } from '@core/notifications/notification.service';
import {
  QueuedWrite,
  QueueableKind,
  describeQueue,
  isReplayable,
  parked,
  queued,
  readQueue,
  replayable,
  withFailure,
  writeQueue,
} from './queue.model';

/**
 * Holds writes that could not be sent and replays them when the link comes
 * back. Only usage entries are held; everything else is refused at the point
 * of trying, because replaying a calibration result minutes later against a
 * register that has moved on is worse than not sending it at all.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly http = inject(RegistryHttpService);
  private readonly notifications = inject(NotificationService);

  private readonly queueState = signal<readonly QueuedWrite[]>(readQueue(storage()));
  private readonly replayingState = signal(false);
  private readonly onlineState = signal(navigator.onLine);

  readonly queue = this.queueState.asReadonly();
  readonly replaying = this.replayingState.asReadonly();
  readonly online = this.onlineState.asReadonly();

  readonly waiting = computed(() => replayable(this.queueState()).length);
  readonly stuck = computed(() => parked(this.queueState()).length);
  readonly summary = computed(() => describeQueue(this.queueState()));
  readonly hasWork = computed(() => this.queueState().length > 0);

  constructor() {
    window.addEventListener('online', () => {
      this.onlineState.set(true);
      this.replay();
    });
    window.addEventListener('offline', () => this.onlineState.set(false));
  }

  /** True when the caller may hold this write instead of surfacing a failure. */
  canHold(path: string): boolean {
    return isReplayable(path);
  }

  hold(kind: QueueableKind, body: unknown, describedAs: string): void {
    const write = queued(kind, body, describedAs);
    this.persist([...this.queueState(), write]);
    this.notifications.warning(
      'Held until the registry comes back',
      `${describedAs} is saved on this terminal and will be sent when the link returns.`,
    );
  }

  replay(): void {
    const pending = replayable(this.queueState());
    if (pending.length === 0 || this.replayingState()) {
      return;
    }
    this.replayingState.set(true);

    const sends = pending.map((write) =>
      this.http.post(write.path, write.body).pipe(
        tap(() => this.settle(write)),
        catchError((error: RegistryError) => {
          this.fail(write, error);
          return of(null);
        }),
      ),
    );

    concat(...sends).subscribe({
      complete: () => {
        this.replayingState.set(false);
        const sent = pending.length - replayable(this.queueState()).length;
        if (sent > 0) {
          this.notifications.success(`${sent} held ${sent === 1 ? 'entry' : 'entries'} sent`);
        }
      },
    });
  }

  discard(id: string): void {
    this.persist(this.queueState().filter((write) => write.id !== id));
  }

  discardParked(): void {
    const stuck = new Set(parked(this.queueState()).map((write) => write.id));
    this.persist(this.queueState().filter((write) => !stuck.has(write.id)));
  }

  private settle(write: QueuedWrite): void {
    this.persist(this.queueState().filter((entry) => entry.id !== write.id));
  }

  private fail(write: QueuedWrite, error: RegistryError): void {
    this.persist(
      this.queueState().map((entry) =>
        entry.id === write.id ? withFailure(entry, error.message) : entry,
      ),
    );
  }

  private persist(queue: readonly QueuedWrite[]): void {
    this.queueState.set(queue);
    writeQueue(storage(), queue);
  }
}

function storage(): Storage {
  return localStorage;
}
