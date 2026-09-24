import { BadRequestException } from '@nestjs/common';

export type ValidationFields = Record<string, string>;

export class ValidationException extends BadRequestException {
  constructor(readonly fields: ValidationFields) {
    super('Validation failed');
  }
}
