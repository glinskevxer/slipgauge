import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { EntityNotFoundError, OptimisticLockVersionMismatchError, QueryFailedError } from 'typeorm';

import { ErrorCode, RegistryException } from './errors';

const BASE = 'https://errors.slipgauge.internal/';

interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  timestamp: string;
  context?: Record<string, unknown>;
  fields?: Record<string, string>;
}

/**
 * Turns everything the service throws into RFC 7807 problem documents. The
 * console reads the type field, never the human sentence, so the mapping from
 * a thrown thing to a code lives in exactly one place.
 */
@Catch()
export class ProblemDetailFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const problem = this.describe(exception, request);

    if (problem.status >= 500) {
      this.logger.error(
        `unhandled failure on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (problem.status === 401 || problem.status === 403) {
      this.logger.log(`${problem.code} on ${request.method} ${request.url}`);
    }

    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private describe(exception: unknown, request: Request): ProblemDetail {
    if (exception instanceof RegistryException) {
      return this.problem(exception.getStatus(), exception.code, exception.message, request, {
        context: Object.keys(exception.context).length > 0 ? exception.context : undefined,
      });
    }

    if (exception instanceof OptimisticLockVersionMismatchError) {
      return this.problem(
        HttpStatus.CONFLICT,
        ErrorCode.STALE_RECORD,
        'the record changed while you were editing it, reload and try again',
        request,
      );
    }

    if (exception instanceof EntityNotFoundError) {
      return this.problem(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'that record does not exist',
        request,
      );
    }

    if (exception instanceof QueryFailedError) {
      return this.fromDatabase(exception, request);
    }

    if (exception instanceof HttpException) {
      return this.fromHttp(exception, request);
    }

    return this.problem(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL,
      'the request could not be completed',
      request,
    );
  }

  /**
   * A unique violation that reached the database is a race the service lost,
   * not a fault. Reporting it as a conflict lets the console retry sensibly
   * rather than showing somebody a five hundred.
   */
  private fromDatabase(exception: QueryFailedError, request: Request): ProblemDetail {
    const code = (exception.driverError as { code?: string } | undefined)?.code;

    if (code === '23505') {
      return this.problem(
        HttpStatus.CONFLICT,
        ErrorCode.ALREADY_EXISTS,
        'that record already exists',
        request,
      );
    }
    if (code === '23514' || code === '23503') {
      return this.problem(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.RULE_VIOLATION,
        'the database refused that as it stands',
        request,
      );
    }
    return this.problem(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL,
      'the request could not be completed',
      request,
    );
  }

  private fromHttp(exception: HttpException, request: Request): ProblemDetail {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const code = codeForStatus(status);

    // The validation pipe puts its field messages in a message array.
    if (typeof body === 'object' && body !== null && Array.isArray((body as never)['message'])) {
      const messages = (body as { message: string[] }).message;
      return this.problem(status, ErrorCode.VALIDATION_FAILED, 'the request body failed validation', request, {
        fields: fieldsFrom(messages),
      });
    }

    const detail =
      typeof body === 'object' && body !== null && typeof (body as never)['message'] === 'string'
        ? (body as { message: string }).message
        : exception.message;

    return this.problem(status, code, detail, request);
  }

  private problem(
    status: number,
    code: ErrorCode,
    detail: string,
    request: Request,
    extra: Partial<ProblemDetail> = {},
  ): ProblemDetail {
    return {
      type: BASE + code,
      title: titleFor(code),
      status,
      detail,
      instance: request.url,
      code,
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.ALREADY_EXISTS;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ErrorCode.RULE_VIOLATION;
    default:
      return status >= 500 ? ErrorCode.INTERNAL : ErrorCode.VALIDATION_FAILED;
  }
}

function titleFor(code: ErrorCode): string {
  return code.replace('registry/', '').replace(/-/g, '_').toUpperCase();
}

/**
 * The validation pipe reports one sentence per broken rule, each beginning
 * with the property name. The console wants them keyed by field, and it wants
 * the first message per field rather than all of them.
 */
function fieldsFrom(messages: readonly string[]): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const message of messages) {
    const field = message.split(' ')[0];
    if (field && !(field in fields)) {
      fields[field] = message;
    }
  }
  return fields;
}
