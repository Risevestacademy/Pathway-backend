import { jest } from '@jest/globals';
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';

type ErrorResponseBody = {
  statusCode: number;
  message: string | string[];
  error: string;
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
  let mockRequest: Pick<Request, 'url'>;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn<(statusCode: number) => MockResponse>().mockReturnThis(),
      json: jest
        .fn<(body: ErrorResponseBody) => MockResponse>()
        .mockReturnThis(),
    };

    mockRequest = {
      url: '/test',
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

  it('should format validation errors with VALIDATION_ERROR code', () => {
    const exception = new HttpException(
      { message: ['email must be an email'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['email must be an email'],
        error: 'VALIDATION_ERROR',
      }),
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
});