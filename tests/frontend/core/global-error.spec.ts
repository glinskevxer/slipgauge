import { TestBed } from '@angular/core/testing';

import { GlobalErrorHandler } from '@core/errors/global-error.handler';
import { RegistryError } from '@core/errors/problem';
import { NotificationService } from '@core/notifications/notification.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let notifications: NotificationService;
  let logged: jest.SpyInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GlobalErrorHandler, NotificationService] });
    handler = TestBed.inject(GlobalErrorHandler);
    notifications = TestBed.inject(NotificationService);
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    notifications.dismissAll();
    logged.mockRestore();
  });

  it('shows an error nobody handled', () => {
    handler.handleError(new Error('cannot read properties of undefined'));

    const notice = notifications.notices()[0];
    expect(notice.tone).toBe('failure');
    expect(notice.headline).toBe('Something went wrong on this screen');
    expect(notice.detail).toContain('cannot read properties of undefined');
  });

  it('tells the operator what to do about it', () => {
    handler.handleError(new Error('boom'));

    expect(notifications.notices()[0].detail).toContain('tell the metrology office');
  });

  it('still writes the stack out for anybody with the console open', () => {
    const thrown = new Error('boom');
    handler.handleError(thrown);

    expect(logged).toHaveBeenCalledWith(thrown);
  });

  it('swallows a repeat of the same fault', () => {
    handler.handleError(new Error('boom'));
    handler.handleError(new Error('boom'));
    handler.handleError(new Error('boom'));

    expect(notifications.count()).toBe(1);
  });

  it('still shows a different fault straight after', () => {
    handler.handleError(new Error('boom'));
    handler.handleError(new Error('something else'));

    expect(notifications.count()).toBe(2);
  });

  it('words a service failure the way the rest of the console does', () => {
    handler.handleError(new RegistryError('registry/offline', 0, 'unreachable'));

    expect(notifications.notices()[0].headline).toBe('The registry cannot be reached');
  });

  it('copes with something thrown that is not an error at all', () => {
    handler.handleError('a bare string');

    expect(notifications.notices()[0].detail).toContain('a bare string');
  });

  it('copes with something with no message at all', () => {
    handler.handleError({ unexpected: true });

    expect(notifications.notices()[0].detail).toContain('An unexpected fault');
  });

  it('falls back to the name when an error carries no message', () => {
    const nameless = new TypeError();
    handler.handleError(nameless);

    expect(notifications.notices()[0].detail).toContain('TypeError');
  });
});
