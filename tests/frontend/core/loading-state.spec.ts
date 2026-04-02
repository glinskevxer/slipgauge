import { Subject, throwError } from 'rxjs';

import { RegistryError } from '@core/errors/problem';
import { LoadingState } from '@core/loading-state';

function failure(): RegistryError {
  return new RegistryError('registry/internal', 500, 'the service is not answering');
}

describe('LoadingState', () => {
  let state: LoadingState;

  beforeEach(() => {
    state = new LoadingState();
  });

  it('starts idle with nothing wrong', () => {
    expect(state.loading()).toBe(false);
    expect(state.error()).toBeNull();
  });

  it('is loading between the start and the value', () => {
    const source = new Subject<number>();
    const seen: number[] = [];

    state.track(source, (value) => seen.push(value));
    expect(state.loading()).toBe(true);

    source.next(7);
    expect(seen).toEqual([7]);
    expect(state.loading()).toBe(false);
  });

  it('stops loading when the request fails, rather than reading for ever', () => {
    state.track(throwError(() => failure()), () => undefined);

    expect(state.loading()).toBe(false);
    expect(state.error()?.message).toBe('the service is not answering');
  });

  it('clears the last failure when a new load starts', () => {
    state.track(throwError(() => failure()), () => undefined);
    expect(state.error()).not.toBeNull();

    const source = new Subject<number>();
    state.track(source, () => undefined);
    expect(state.error()).toBeNull();
  });

  it('clears the failure on a load that succeeds', () => {
    state.track(throwError(() => failure()), () => undefined);

    const source = new Subject<number>();
    state.track(source, () => undefined);
    source.next(1);

    expect(state.error()).toBeNull();
  });

  it('runs the failure handler after the state is already set', () => {
    let loadingWhenCalled: boolean | null = null;

    state.track(
      throwError(() => failure()),
      () => undefined,
      () => {
        loadingWhenCalled = state.loading();
      },
    );

    expect(loadingWhenCalled).toBe(false);
  });

  it('does not need a failure handler at all', () => {
    expect(() => state.track(throwError(() => failure()), () => undefined)).not.toThrow();
  });

  it('leaves the flags alone for a request running beside the main one', () => {
    const beside = new Subject<number>();
    const seen: number[] = [];

    state.beside(beside, (value) => seen.push(value), () => undefined);
    expect(state.loading()).toBe(false);

    beside.next(3);
    expect(seen).toEqual([3]);
    expect(state.error()).toBeNull();
  });

  it('does not let a failure beside the main request look like a broken page', () => {
    let recovered = false;

    state.beside(
      throwError(() => failure()),
      () => undefined,
      () => {
        recovered = true;
      },
    );

    expect(recovered).toBe(true);
    expect(state.error()).toBeNull();
    expect(state.loading()).toBe(false);
  });

  it('can be driven by hand where a store needs to', () => {
    state.begin();
    expect(state.loading()).toBe(true);

    state.fail(failure());
    expect(state.loading()).toBe(false);
    expect(state.error()).not.toBeNull();

    state.succeed();
    expect(state.error()).toBeNull();
  });
});
