import { BadRequestException } from '@nestjs/common';
import { type Request } from 'express';

import { resolveClientPlatform } from './client-platform';

const requestWith = (value?: string) =>
  ({ get: () => value }) as unknown as Request;

describe('resolveClientPlatform', () => {
  it('defaults to web when the header is absent', () => {
    expect(resolveClientPlatform(requestWith(undefined))).toBe('web');
  });

  it('defaults to web when the header is blank', () => {
    expect(resolveClientPlatform(requestWith('   '))).toBe('web');
  });

  it('resolves mobile from the header', () => {
    expect(resolveClientPlatform(requestWith('mobile'))).toBe('mobile');
  });

  it('resolves web from the header', () => {
    expect(resolveClientPlatform(requestWith('web'))).toBe('web');
  });

  it('ignores casing and surrounding whitespace', () => {
    expect(resolveClientPlatform(requestWith(' MoBiLe '))).toBe('mobile');
  });

  it('rejects a repeated header, which arrives as one joined value', () => {
    expect(() => resolveClientPlatform(requestWith('mobile, web'))).toThrow(
      BadRequestException,
    );
  });

  it('rejects an unsupported platform', () => {
    expect(() => resolveClientPlatform(requestWith('desktop'))).toThrow(
      BadRequestException,
    );
  });
});
