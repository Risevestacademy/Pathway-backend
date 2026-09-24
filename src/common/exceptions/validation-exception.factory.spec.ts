import { ValidationPipe } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ValidationException } from './validation.exception';
import { validationExceptionFactory } from './validation-exception.factory';

class TestDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

describe('validationExceptionFactory', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });

  const validate = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: TestDto });

  const failure = async (value: unknown): Promise<ValidationException> => {
    try {
      await validate(value);
    } catch (e) {
      return e as ValidationException;
    }
    throw new Error('expected validation to fail');
  };

  it('maps each invalid field to its message without the field name (single error)', async () => {
    const error = await failure({
      email: 'nope',
      password: 'short',
    });

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.fields).toEqual({
      email: 'must be an email',
      password: 'must be longer than or equal to 8 characters',
    });
  });

  it('returns an array of messages when a field has multiple validation errors', async () => {
    const error = await failure({
      email: 'a@b.com',
      password: 123, // Fails BOTH @IsString() AND @MinLength(8)
    });

    expect(error).toBeInstanceOf(ValidationException);

    const passwordErrors = Array.isArray(error.fields.password)
      ? [...error.fields.password].sort()
      : [error.fields.password];

    expect(passwordErrors).toEqual(
      [
        'must be a string',
        'must be longer than or equal to 8 characters',
      ].sort(),
    );
  });

  it('reports unexpected properties', async () => {
    const error = await failure({
      email: 'a@b.com',
      password: 'long-enough',
      extraField: true,
    });

    expect(Object.keys(error.fields)).toContain('extraField');
    expect(error.fields['extraField']).toBe(
      'property extraField should not exist',
    );
  });
});
