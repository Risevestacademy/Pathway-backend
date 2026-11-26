import { describe, expect, it } from '@jest/globals';
import { ContentType } from '../../generated/prisma/client';
import {
  getStrategy,
  hasStrategy,
  registeredContentTypes,
} from '../envelope/registry';
import {
  fakeCareerStrategy,
  fakeResourceStrategy,
  registerTestStrategies,
} from '../__test__/helpers/strategy';

describe('envelope registry', () => {
  // Idempotent — safe even if another spec in the same Jest worker already
  // registered these. `registerTestStrategies()` guards against duplicate
  // registration internally.
  registerTestStrategies();

  it('hasStrategy returns true for registered types', () => {
    expect(hasStrategy('CAREER' as ContentType)).toBe(true);
    expect(hasStrategy('RESOURCE' as ContentType)).toBe(true);
  });

  it('hasStrategy returns false for an unregistered type', () => {
    // 'PATHWAY' is a valid ContentType union member but nothing registers it.
    expect(hasStrategy('PATHWAY' as ContentType)).toBe(false);
  });

  it('getStrategy returns the registered instance', () => {
    expect(getStrategy('CAREER' as ContentType)).toBe(fakeCareerStrategy);
    expect(getStrategy('RESOURCE' as ContentType)).toBe(fakeResourceStrategy);
  });

  it('getStrategy throws for an unregistered type', () => {
    expect(() => getStrategy('PATHWAY' as ContentType)).toThrow(
      /No RevisionStrategy registered for contentType "PATHWAY"/,
    );
  });

  it('registeredContentTypes lists the registered types', () => {
    const types = registeredContentTypes();
    expect(types).toEqual(expect.arrayContaining(['CAREER', 'RESOURCE']));
  });

  it('is a function — registeredContentTypes returns a fresh array each call', () => {
    const a = registeredContentTypes();
    const b = registeredContentTypes();
    expect(a).not.toBe(b); // defensive: a caller mutating one must not affect the other
  });
});
