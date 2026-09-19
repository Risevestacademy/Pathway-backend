import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';

type HttpExceptionBody = { message?: string | string[] };

interface ExceptionLogger {
  setContext(context: string): void;
  error(object: object, message: string): void;
}

const hasMessage = (response: object): response is HttpExceptionBody =>
  'message' in response;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(PinoLogger)
    private readonly logger: ExceptionLogger,
  ) {
    this.logger.setContext(HttpExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string | string[];
    let errorCode: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse !== null && hasMessage(exceptionResponse)) {
        message = exceptionResponse.message || exception.message;
      } else {
        message = exception.message;
      }

      if (statusCode === HttpStatus.BAD_REQUEST && Array.isArray(message)) {
        errorCode = 'VALIDATION_ERROR';
      } else {
        errorCode = this.getErrorCode(statusCode);
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      errorCode = 'INTERNAL_SERVER_ERROR';

      this.logger.error(
        {
          err: exception,
          requestId: request.id,
          method: request.method,
          route: request.url,
          statusCode,
        },
        'Unexpected error',
      );
    }

    const errorResponse = {
      statusCode,
      message,
      error: errorCode,
      path: request.url,
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