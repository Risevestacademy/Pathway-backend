import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../exceptions/validation-exception.factory';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });
}
