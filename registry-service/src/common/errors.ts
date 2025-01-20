import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Stable machine readable reasons the console switches on. The strings are
 * part of the API contract, so they are never reworded once released.
 */
export enum ErrorCode {
  NOT_FOUND = 'registry/not-found',
  ALREADY_EXISTS = 'registry/already-exists',
  INVALID_TRANSITION = 'registry/invalid-transition',
  VALIDATION_FAILED = 'registry/validation-failed',
  RULE_VIOLATION = 'registry/rule-violation',
  TRACEABILITY_BROKEN = 'registry/traceability-broken',
  STALE_RECORD = 'registry/stale-record',
  UNAUTHENTICATED = 'registry/unauthenticated',
  FORBIDDEN = 'registry/forbidden',
  INTERNAL = 'registry/internal',
}

/**
 * Base for every failure the domain raises deliberately. Carrying the code and
 * the detail map here means the filter never has to guess a status from a
 * class name.
 */
export class RegistryException extends HttpException {
  readonly code: ErrorCode;
  readonly context: Record<string, unknown>;

  constructor(code: ErrorCode, status: HttpStatus, message: string) {
    super(message, status);
    this.code = code;
    this.context = {};
  }

  with(key: string, value: unknown): this {
    this.context[key] = value;
    return this;
  }
}

export class NotFoundError extends RegistryException {
  constructor(what: string, identifier: string | number) {
    super(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, `${what} ${identifier} does not exist`);
    this.with('resource', what).with('identifier', String(identifier));
  }
}

export class ConflictError extends RegistryException {
  constructor(message: string) {
    super(ErrorCode.ALREADY_EXISTS, HttpStatus.CONFLICT, message);
  }

  static duplicate(what: string, identifier: string): ConflictError {
    return new ConflictError(`${what} ${identifier} already exists`)
      .with('resource', what)
      .with('identifier', identifier);
  }
}

/**
 * A request that is well formed but that the laboratory's own rules forbid.
 * Calibrating with an expired standard lands here, so does stretching an
 * interval past what the class allows.
 */
export class RuleViolationError extends RegistryException {
  constructor(message: string, code: ErrorCode = ErrorCode.RULE_VIOLATION) {
    super(code, HttpStatus.UNPROCESSABLE_ENTITY, message);
  }
}

export class StaleRecordError extends RegistryException {
  constructor() {
    super(
      ErrorCode.STALE_RECORD,
      HttpStatus.CONFLICT,
      'the record changed while you were editing it, reload and try again',
    );
  }
}

export class InvalidTransitionError extends RegistryException {
  constructor(message: string) {
    super(ErrorCode.INVALID_TRANSITION, HttpStatus.CONFLICT, message);
  }
}
