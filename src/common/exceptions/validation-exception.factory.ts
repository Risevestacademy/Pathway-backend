import type { ValidationError } from '@nestjs/common';
import {
  ValidationException,
  type ValidationFields,
} from './validation.exception';

const stripFieldName = (property: string, message: string): string => {
  if (!property) return message;
  return message.startsWith(`${property} `)
    ? message.slice(property.length + 1)
    : message;
};

const collectFields = (
  errors: ValidationError[],
  parentPath: string,
  fields: ValidationFields,
): void => {
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const messages = Object.values(error.constraints ?? {}).map((msg) =>
      stripFieldName(error.property, msg),
    );

    if (messages.length > 0) {
      fields[path] = messages.length === 1 ? messages[0] : messages;
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
