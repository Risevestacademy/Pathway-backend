import { HttpException, HttpStatus } from '@nestjs/common';

export type DomainErrorDetails = Record<string, unknown>;

export class DomainException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: DomainErrorDetails,
  ) {
    super(message, status);
  }
}
