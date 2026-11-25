import { describe, expect, it, jest } from '@jest/globals';
import type { Prisma } from '../../generated/prisma/client';
import { currentVersion } from '../envelope/versions';

describe('currentVersion', () => {
  it('delegates to contentRevisionPublishEvent.count with a { contentType, contentId } filter', async () => {
    const count = jest.fn(async () => 7);
    const tx = {
      contentRevisionPublishEvent: { count },
    } as unknown as Prisma.TransactionClient;

    const result = await currentVersion(tx, 'CAREER', 'career-1');

    expect(result).toBe(7);
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({
      where: { contentType: 'CAREER', contentId: 'career-1' },
    });
  });

  it('passes through zero (a root with no publishes)', async () => {
    const count = jest.fn(async () => 0);
    const tx = {
      contentRevisionPublishEvent: { count },
    } as unknown as Prisma.TransactionClient;

    const result = await currentVersion(tx, 'RESOURCE', 'res-1');

    expect(result).toBe(0);
  });

  it('does not memoise or batch: each call issues exactly one count', async () => {
    const count = jest.fn(async () => 1);
    const tx = {
      contentRevisionPublishEvent: { count },
    } as unknown as Prisma.TransactionClient;

    await currentVersion(tx, 'CAREER', 'career-1');
    await currentVersion(tx, 'CAREER', 'career-1'); // same key, no caching
    await currentVersion(tx, 'CAREER', 'career-2');

    expect(count).toHaveBeenCalledTimes(3);
  });
});
