/**
 * RFC 7807 problem document, in the shape the registry service emits. The
 * console switches on `code` and never on the human sentence, which is free to
 * change without a release on this side.
 */
export interface ProblemDetail {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
  readonly timestamp: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly fields?: Readonly<Record<string, string>>;
}

export type RegistryErrorCode =
  | 'registry/not-found'
  | 'registry/already-exists'
  | 'registry/invalid-transition'
  | 'registry/validation-failed'
  | 'registry/unauthenticated'
  | 'registry/forbidden'
  | 'registry/rule-violation'
  | 'registry/traceability-broken'
  | 'registry/stale-record'
  | 'registry/internal'
  | 'registry/offline';

export class RegistryError extends Error {
  constructor(
    readonly code: RegistryErrorCode,
    readonly status: number,
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
    readonly context: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'RegistryError';
  }

  get isNotFound(): boolean {
    return this.code === 'registry/not-found';
  }

  /** True when the caller is signed in but the role does not allow it. */
  get isForbidden(): boolean {
    return this.code === 'registry/forbidden';
  }

  get isConflict(): boolean {
    return this.code === 'registry/already-exists' || this.code === 'registry/stale-record';
  }

  /** True when retrying the same request unchanged could plausibly work. */
  get isRetryable(): boolean {
    return this.code === 'registry/internal' || this.code === 'registry/offline';
  }

  /** The message a field level form control should show, if any. */
  fieldMessage(field: string): string | undefined {
    return this.fields[field];
  }
}

function isProblemDetail(value: unknown): value is ProblemDetail {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ProblemDetail).code === 'string' &&
    typeof (value as ProblemDetail).status === 'number'
  );
}

/**
 * Normalises whatever came back into a RegistryError. A gateway timeout, a
 * proxy HTML page and a genuine problem document all end up as one type, so
 * every caller has exactly one shape to handle.
 */
export function toRegistryError(status: number, body: unknown): RegistryError {
  if (isProblemDetail(body)) {
    return new RegistryError(
      body.code as RegistryErrorCode,
      body.status,
      body.detail || body.title,
      body.fields ?? {},
      body.context ?? {},
    );
  }
  if (status === 0) {
    return new RegistryError(
      'registry/offline',
      0,
      'The registry service could not be reached. Check the connection and try again.',
    );
  }
  if (status === 404) {
    return new RegistryError('registry/not-found', 404, 'That record no longer exists.');
  }
  return new RegistryError(
    'registry/internal',
    status,
    'The registry service returned an unexpected response.',
  );
}
