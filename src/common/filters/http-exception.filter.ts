import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import type {
  ArgumentsHost,
  ExceptionFilter,
  LoggerService,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import {
  ValidationException,
  ValidationFields,
} from '../exceptions/validation.exception';

type RequestWithId = Request & {
  id?: string;
};

type HttpExceptionBody = {
  message?: string | string[];
};

const hasMessage = (response: object): response is HttpExceptionBody =>
  'message' in response;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger: LoggerService;

  constructor(@Optional() logger?: LoggerService) {
    this.logger = logger || new Logger(HttpExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    let statusCode: number;
    let message: string | string[];
    let errorCode: string;
    let fields: ValidationFields | undefined;

    if (exception instanceof ValidationException) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      errorCode = 'VALIDATION_ERROR';
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse !== null && hasMessage(exceptionResponse)) {
        message =
          (exceptionResponse as HttpExceptionBody).message || exception.message;
      } else {
        message = exception.message;
      }

      errorCode = this.getErrorCode(statusCode);
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      errorCode = 'INTERNAL_SERVER_ERROR';

      this.logger.error(
        {
          err: exception,
          requestId: request.id,
          method: request.method,
          route: request.originalUrl,
          statusCode,
        },
        'Unexpected error',
      );
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception);
    }

    const errorResponse = {
      statusCode,
      message,
      error: errorCode,
      ...(fields && { fields }),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(errorResponse);
  }

  private getErrorCode(statusCode: number): string {
    const errorMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };

    return errorMap[statusCode] || 'UNKNOWN_ERROR';
  }
}
