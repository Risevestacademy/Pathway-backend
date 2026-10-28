import { describe, expect, it } from '@jest/globals';
import { isTempId } from './career-snapshot.types';

describe('isTempId', () => {
  it.each(['new-1', 'new-42'])('recognises %s as a temporary id', (id) => {
    expect(isTempId(id)).toBe(true);
  });

  it.each([
    '9a4c2e1f-7b3d-4c5e-8f6a-1d2b3c4e5f6a',
    'new-',
    'new-x',
    'old-1',
    'new-1-2',
  ])('rejects %s', (id) => {
    expect(isTempId(id)).toBe(false);
  });
});
