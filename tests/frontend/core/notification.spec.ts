import { TestBed } from '@angular/core/testing';

import { RegistryError } from '@core/errors/problem';
import { isDuplicateOf, notice, toneIcon } from '@core/notifications/notification.model';
import { NotificationService } from '@core/notifications/notification.service';

describe('notice model', () => {
  it('gives every notice its own id', () => {
    expect(notice('info', 'a').id).not.toBe(notice('info', 'a').id);
  });

  it('lets a failure stay until it is dismissed', () => {
    expect(notice('failure', 'gone wrong').dismissAfterMs).toBe(0);
    expect(notice('success', 'saved').dismissAfterMs).toBeGreaterThan(0);
    expect(notice('warning', 'careful').dismissAfterMs).toBeGreaterThan(
      notice('success', 'saved').dismissAfterMs,
    );
  });

  it('has an icon for every tone', () => {
    expect(toneIcon('success')).toBe('✓');
    expect(toneIcon('failure')).toBe('×');
    expect(toneIcon('warning')).toBe('!');
    expect(toneIcon('info')).toBe('i');
  });

  it('calls two identical notices raised together duplicates', () => {
    const first = notice('success', 'Saved', 'SG-000001');
    const second = { ...notice('success', 'Saved', 'SG-000001'), raisedAt: first.raisedAt + 500 };

    expect(isDuplicateOf(second, first)).toBe(true);
  });

  it('does not call the same message a duplicate once time has passed', () => {
    const first = notice('success', 'Saved');
    const later = { ...notice('success', 'Saved'), raisedAt: first.raisedAt + 5000 };

    expect(isDuplicateOf(later, first)).toBe(false);
  });

  it('does not merge notices with different detail', () => {
    const first = notice('success', 'Saved', 'SG-000001');
    const second = { ...notice('success', 'Saved', 'SG-000002'), raisedAt: first.raisedAt };

    expect(isDuplicateOf(second, first)).toBe(false);
  });
});

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({ providers: [NotificationService] });
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    service.dismissAll();
    jest.useRealTimers();
  });

  it('shows what it is given', () => {
    service.success('Instrument booked in', 'SG-000101');

    expect(service.count()).toBe(1);
    expect(service.notices()[0].headline).toBe('Instrument booked in');
  });

  it('clears a success on its own but keeps a failure', () => {
    service.success('Saved');
    service.failure('Not saved');

    jest.advanceTimersByTime(30_000);

    expect(service.count()).toBe(1);
    expect(service.notices()[0].tone).toBe('failure');
  });

  it('collapses a burst of identical notices into one', () => {
    for (let i = 0; i < 6; i++) {
      service.success('Saved', 'six rows at once');
    }

    expect(service.count()).toBe(1);
  });

  it('never shows more than five at a time', () => {
    for (let i = 0; i < 9; i++) {
      service.failure(`Failure ${i}`);
    }

    expect(service.count()).toBe(5);
    expect(service.notices()[0].headline).toBe('Failure 4');
  });

  it('dismissing one leaves the others alone', () => {
    service.failure('First');
    service.failure('Second');
    const id = service.notices()[0].id;

    service.dismiss(id);

    expect(service.count()).toBe(1);
    expect(service.notices()[0].headline).toBe('Second');
  });

  it('turns a stale record into a reload rather than a lecture', () => {
    let reloaded = false;
    service.fromError(
      new RegistryError('registry/stale-record', 409, 'the record changed'),
      'Saving the instrument',
      () => (reloaded = true),
    );

    const raised = service.notices()[0];
    expect(raised.tone).toBe('warning');
    expect(raised.headline).toBe('Somebody else changed this record');
    raised.action?.run();
    expect(reloaded).toBe(true);
  });

  it('says what was not saved when the service is unreachable', () => {
    service.fromError(
      new RegistryError('registry/offline', 0, 'unreachable'),
      'Filing the certificate',
    );

    expect(service.notices()[0].tone).toBe('failure');
    expect(service.notices()[0].detail).toContain('Filing the certificate was not saved');
  });

  it('treats a role refusal as a warning, not a fault', () => {
    service.fromError(
      new RegistryError('registry/forbidden', 403, 'your role does not allow that'),
      'Withdrawing the certificate',
    );

    expect(service.notices()[0].tone).toBe('warning');
    expect(service.countOf('failure')).toBe(0);
  });

  it('falls back to the service message for anything else', () => {
    service.fromError(
      new RegistryError('registry/rule-violation', 422, 'nominal sits outside the range'),
      'Filing the certificate',
    );

    expect(service.notices()[0].headline).toBe('Filing the certificate failed');
    expect(service.notices()[0].detail).toBe('nominal sits outside the range');
  });

  it('reports that a failure is showing so the shell can flag it', () => {
    expect(service.hasFailure()).toBe(false);
    service.failure('Broken');
    expect(service.hasFailure()).toBe(true);
  });
});
