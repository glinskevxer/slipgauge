import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { NotificationService } from '@core/notifications/notification.service';
import { OfflineQueueService } from '@core/offline/queue.service';
import { ATTEMPT_LIMIT, readQueue } from '@core/offline/queue.model';

describe('OfflineQueueService', () => {
  let queue: OfflineQueueService;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    queue = TestBed.inject(OfflineQueueService);
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    notifications.dismissAll();
    localStorage.clear();
    http.verify();
  });

  function hold(workOrder = 'WO-1'): void {
    queue.hold('USAGE', { assetTag: 'SG-000101', workOrder }, `SG-000101 on ${workOrder}`);
  }

  it('starts with nothing waiting', () => {
    expect(queue.hasWork()).toBe(false);
    expect(queue.summary()).toBe('nothing waiting');
  });

  it('only offers to hold the writes that are safe to repeat', () => {
    expect(queue.canHold('/api/usage')).toBe(true);
    expect(queue.canHold('/api/certificates')).toBe(false);
    expect(queue.canHold('/api/instruments')).toBe(false);
  });

  it('tells the operator what it kept back', () => {
    hold();

    expect(queue.waiting()).toBe(1);
    expect(notifications.notices()[0].headline).toContain('Held until the registry comes back');
    expect(notifications.notices()[0].detail).toContain('WO-1');
  });

  it('survives a reload', () => {
    hold();

    expect(readQueue(localStorage)).toHaveLength(1);
  });

  it('sends what it held once asked to', () => {
    hold('WO-1');
    hold('WO-2');

    queue.replay();
    http.expectOne((request) => request.url.endsWith('/usage')).flush({ id: 1 });
    http.expectOne((request) => request.url.endsWith('/usage')).flush({ id: 2 });

    expect(queue.hasWork()).toBe(false);
    expect(notifications.notices().some((notice) => notice.headline.includes('sent'))).toBe(true);
  });

  it('sends them oldest first so the log keeps its order', () => {
    hold('WO-1');
    hold('WO-2');

    queue.replay();
    const first = http.expectOne((request) => request.url.endsWith('/usage'));
    expect((first.request.body as { workOrder: string }).workOrder).toBe('WO-1');
    first.flush({ id: 1 });
    http.expectOne((request) => request.url.endsWith('/usage')).flush({ id: 2 });
  });

  it('keeps an entry that failed again and counts the attempt', () => {
    hold();

    queue.replay();
    http
      .expectOne((request) => request.url.endsWith('/usage'))
      .error(new ProgressEvent('offline'), { status: 0, statusText: 'Unknown Error' });

    expect(queue.waiting()).toBe(1);
    expect(queue.queue()[0].attempts).toBe(1);
  });

  it('parks an entry once it has failed too often', () => {
    hold();

    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      queue.replay();
      const request = http.match((candidate) => candidate.url.endsWith('/usage'))[0];
      if (!request) {
        break;
      }
      request.error(new ProgressEvent('offline'), { status: 0, statusText: 'Unknown Error' });
    }

    expect(queue.stuck()).toBe(1);
    expect(queue.waiting()).toBe(0);
    expect(queue.summary()).toBe('1 could not be sent');
  });

  it('sends nothing when there is nothing to send', () => {
    queue.replay();

    http.expectNone((request) => request.url.endsWith('/usage'));
  });

  it('discards one entry by id', () => {
    hold('WO-1');
    hold('WO-2');

    queue.discard(queue.queue()[0].id);

    expect(queue.queue()).toHaveLength(1);
    expect(readQueue(localStorage)).toHaveLength(1);
  });

  it('discards everything that is parked in one go', () => {
    hold();
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      queue.replay();
      const request = http.match((candidate) => candidate.url.endsWith('/usage'))[0];
      if (!request) {
        break;
      }
      request.error(new ProgressEvent('offline'), { status: 0, statusText: 'Unknown Error' });
    }
    hold('WO-fresh');

    queue.discardParked();

    expect(queue.stuck()).toBe(0);
    expect(queue.waiting()).toBe(1);
  });

  it('says both halves when some are waiting and some are stuck', () => {
    hold();
    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      queue.replay();
      const request = http.match((candidate) => candidate.url.endsWith('/usage'))[0];
      if (!request) {
        break;
      }
      request.error(new ProgressEvent('offline'), { status: 0, statusText: 'Unknown Error' });
    }
    hold('WO-fresh');

    expect(queue.summary()).toBe('1 waiting, 1 could not be sent');
  });
});
