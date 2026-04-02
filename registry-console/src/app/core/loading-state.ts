import { Signal, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { RegistryError } from '@core/errors/problem';

/**
 * The "is it loading, did it fail" pair every screen carries.
 *
 * <p>Ten stores had written this out by hand: two private signals, two readonly
 * ones, and the same four lines inside every subscribe. They had drifted in the
 * ways hand copied code does. Two of them left `loading` true when the request
 * failed, so the screen said it was still reading for ever. One cleared the
 * error on success and one did not, so a screen that recovered kept showing the
 * failure underneath the data it had just loaded.
 *
 * <p>This is deliberately not a store base class. Inheritance would drag the
 * whole load in with it and the stores genuinely do load different things in
 * different orders; what they share is only this.
 */
export class LoadingState {
  private readonly busy = signal(false);
  private readonly failure = signal<RegistryError | null>(null);

  readonly loading: Signal<boolean> = this.busy.asReadonly();
  readonly error: Signal<RegistryError | null> = this.failure.asReadonly();

  /** Marks the start of a load, clearing whatever failed last time. */
  begin(): void {
    this.busy.set(true);
    this.failure.set(null);
  }

  succeed(): void {
    this.busy.set(false);
    this.failure.set(null);
  }

  fail(error: RegistryError): void {
    this.busy.set(false);
    this.failure.set(error);
  }

  /**
   * Subscribes, driving the pair and handing the value on.
   *
   * <p>The failure branch is optional and rarely wanted: a screen that shows
   * the error through `error()` does not also need to be told about it. Where
   * one is given it runs after the state has already been set, so a handler
   * cannot leave the screen saying it is still loading.
   */
  track<T>(
    source: Observable<T>,
    onValue: (value: T) => void,
    onError?: (error: RegistryError) => void,
  ): void {
    this.begin();

    source.subscribe({
      next: (value) => {
        onValue(value);
        this.succeed();
      },
      error: (error: RegistryError) => {
        this.fail(error);
        onError?.(error);
      },
    });
  }

  /**
   * Subscribes without touching the loading flag.
   *
   * <p>For the second request a screen fires beside its main one: a summary
   * beside a list, a chart beside a table. Letting those drive the flag makes
   * the screen flicker back to loading after the list has already arrived, and
   * letting them set the error makes a missing summary look like a broken page.
   */
  beside<T>(source: Observable<T>, onValue: (value: T) => void, onFailure: () => void): void {
    source.subscribe({ next: onValue, error: onFailure });
  }
}
