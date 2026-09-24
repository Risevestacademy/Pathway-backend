import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { createValidationPipe } from './validation.pipe';
import { ValidationException } from '../exceptions/validation.exception';

class SampleDto {
  @IsString()
  title: string;

  @IsInt()
  @Min(1)
  rating: number;
}

describe('createValidationPipe', () => {
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: SampleDto,
    data: '',
  };

  const pipe = createValidationPipe();

  it('returns an instance of the target dto', async () => {
    const result = await pipe.transform({ title: 'Node', rating: 4 }, metadata);

    expect(result).toBeInstanceOf(SampleDto);
    expect(result).toEqual({ title: 'Node', rating: 4 });
  });

  it('rejects a payload that violates a constraint', async () => {
    await expect(
      pipe.transform({ title: 'Node', rating: 0 }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a payload with a missing required property', async () => {
    await expect(pipe.transform({ title: 'Node' }, metadata)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a payload carrying properties outside the dto', async () => {
    await expect(
      pipe.transform({ title: 'Node', rating: 4, role: 'ADMIN' }, metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports every failing property in a field map', async () => {
    const error = await pipe
      .transform({ title: 42, rating: 'high' }, metadata)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationException);

    const { fields } = error as ValidationException;
    expect(Object.keys(fields).sort()).toEqual(['rating', 'title']);
    expect(fields.title).toBe('must be a string');
    expect(fields.rating).not.toMatch(/^rating /);
  });

  it('leaves values without a dto untouched', async () => {
    const result = await pipe.transform('raw-uuid', {
      type: 'param',
      metatype: String,
      data: 'id',
    });

    expect(result).toBe('raw-uuid');
  });
});
