import type { ValidationError } from '@nestjs/common';
import {
  ValidationException,
  type ValidationFields,
} from './validation.exception';

// "email must be an email" -> "must be an email"
const stripFieldName = (property: string, message: string): string =>
  message.startsWith(`${property} `)
    ? message.slice(property.length + 1)
    : message;

const collectFields = (
  errors: ValidationError[],
  parentPath: string,
  fields: ValidationFields,
): void => {
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const [firstMessage] = Object.values(error.constraints ?? {});
    if (firstMessage) {
      fields[path] = stripFieldName(error.property, firstMessage);
    }

    if (error.children?.length) {
      collectFields(error.children, path, fields);
    }
  }
};

export const validationExceptionFactory = (
  errors: ValidationError[],
): ValidationException => {
  const fields: ValidationFields = {};
  collectFields(errors, '', fields);
  return new ValidationException(fields);
};
