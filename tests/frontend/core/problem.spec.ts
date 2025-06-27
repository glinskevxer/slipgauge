import { RegistryError, toRegistryError } from '@core/errors/problem';

describe('problem document handling', () => {
  const problem = {
    type: 'https://errors.slipgauge.internal/registry/rule-violation',
    title: 'RULE_VIOLATION',
    status: 422,
    detail: 'nominal 40 sits outside the range of SG-000501',
    code: 'registry/rule-violation',
    timestamp: '2025-04-09T08:12:00Z',
    context: { assetTag: 'SG-000501' },
  };

  it('keeps the service code rather than guessing from the status', () => {
    const error = toRegistryError(422, problem);

    expect(error).toBeInstanceOf(RegistryError);
    expect(error.code).toBe('registry/rule-violation');
    expect(error.message).toBe('nominal 40 sits outside the range of SG-000501');
    expect(error.context['assetTag']).toBe('SG-000501');
  });

  it('reports a status of zero as being offline, not as a server fault', () => {
    const error = toRegistryError(0, null);

    expect(error.code).toBe('registry/offline');
    expect(error.isRetryable).toBe(true);
  });

  it('falls back to not found when a proxy returns a 404 html page', () => {
    const error = toRegistryError(404, '<html>Not Found</html>');

    expect(error.code).toBe('registry/not-found');
    expect(error.isNotFound).toBe(true);
    expect(error.isRetryable).toBe(false);
  });

  it('treats an unrecognised body as an internal fault worth retrying', () => {
    const error = toRegistryError(502, 'Bad Gateway');

    expect(error.code).toBe('registry/internal');
    expect(error.isRetryable).toBe(true);
  });

  it('exposes field messages for a rejected form', () => {
    const error = toRegistryError(400, {
      ...problem,
      status: 400,
      code: 'registry/validation-failed',
      fields: { serialNumber: 'must not be blank' },
    });

    expect(error.fieldMessage('serialNumber')).toBe('must not be blank');
    expect(error.fieldMessage('model')).toBeUndefined();
  });

  it('counts a stale record as a conflict so the form offers a reload', () => {
    const error = toRegistryError(409, { ...problem, status: 409, code: 'registry/stale-record' });

    expect(error.isConflict).toBe(true);
    expect(error.isRetryable).toBe(false);
  });
});
