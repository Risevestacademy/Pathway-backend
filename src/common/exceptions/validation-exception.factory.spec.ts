import { ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsString, MinLength, ValidateNested } from 'class-validator';
import { ValidationException } from './validation.exception';
import { validationExceptionFactory } from './validation-exception.factory';

class AddressDto {
  @IsString() street: string;
}

class TestDto {
  @IsEmail() email: string;
  @MinLength(8) password: string;
  @ValidateNested() @Type(() => AddressDto) address: AddressDto;
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

  it('maps each invalid field to its message without the field name', async () => {
    const error = await failure({
      email: 'nope',
      password: 'short',
      address: { street: 'x' },
    });

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.fields).toEqual({
      email: 'must be an email',
      password: 'must be longer than or equal to 8 characters',
    });
  });

  it('uses dotted paths for nested fields', async () => {
    const error = await failure({
      email: 'a@b.com',
      password: 'long-enough',
      address: { street: 123 },
    });

    expect(error.fields).toEqual({ 'address.street': 'must be a string' });
  });

  it('reports unexpected properties', async () => {
    const error = await failure({
      email: 'a@b.com',
      password: 'long-enough',
      address: { street: 'x' },
      extra: true,
    });

    expect(Object.keys(error.fields)).toContain('extra');
  });
});
