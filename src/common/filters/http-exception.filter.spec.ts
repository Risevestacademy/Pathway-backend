import { jest } from '@jest/globals';
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';
import { ValidationException } from '../exceptions/validation.exception';

type ErrorResponseBody = {
  statusCode: number;
  message: string | string[];
  error: string;
  fields?: Record<string, string>;
  path: string;
  timestamp: string;
};

type MockResponse = {
  status: jest.Mock<(statusCode: number) => MockResponse>;
  json: jest.Mock<(body: ErrorResponseBody) => MockResponse>;
};

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: MockResponse;
  let mockRequest: Pick<Request, 'url' | 'method' | 'id'>;
  let mockLogger: {
    error: jest.Mock;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
    };

    filter = new HttpExceptionFilter(mockLogger);

    mockResponse = {
      status: jest.fn<(statusCode: number) => MockResponse>().mockReturnThis(),
      json: jest
        .fn<(body: ErrorResponseBody) => MockResponse>()
        .mockReturnThis(),
    };

    mockRequest = {
      url: '/test',
      method: 'GET',
      id: 'test-request-id',
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should format a known HTTP exception', () => {
    const exception = new NotFoundException('User not found');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'User not found',
        error: 'NOT_FOUND',
        path: '/test',
      }),
    );
  });

  it('should format validation errors with a per-field map', () => {
    const exception = new ValidationException({
      email: 'must be an email',
      password: 'must be longer than or equal to 8 characters',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR',
        fields: {
          email: 'must be an email',
          password: 'must be longer than or equal to 8 characters',
        },
        path: '/test',
      }),
    );
  });

  it('should not add fields to non-validation errors', () => {
    filter.catch(new NotFoundException('User not found'), mockHost);

    const body = mockResponse.json.mock.calls[0][0];
    expect(body.fields).toBeUndefined();
  });

  it('should treat a 400 with a plain message array as BAD_REQUEST', () => {
    filter.catch(
      new HttpException({ message: ['something'] }, HttpStatus.BAD_REQUEST),
      mockHost,
    );

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'BAD_REQUEST' }),
    );
  });

  it('should fall back to the exception message when the body has no message', () => {
    const exception = new HttpException(
      { error: 'Conflict' },
      HttpStatus.CONFLICT,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: exception.message,
        error: 'CONFLICT',
      }),
    );
  });

  it('should hide details of unexpected errors', () => {
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'INTERNAL_SERVER_ERROR',
      }),
    );
  });

  it('should include a timestamp in ISO format', () => {
    const exception = new NotFoundException('Not found');

    filter.catch(exception, mockHost);

    const response = mockResponse.json.mock.calls[0][0];
    expect(response.timestamp).toBeDefined();
    expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
  });

  it('should log unexpected errors with request context', () => {
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockHost);

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        err: exception,
        requestId: 'test-request-id',
        method: 'GET',
        route: '/test',
        statusCode: 500,
      },
      'Unexpected error',
    );
  });

  it('should not log known HTTP exceptions as unexpected errors', () => {
    const exception = new NotFoundException('User not found');

    filter.catch(exception, mockHost);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
