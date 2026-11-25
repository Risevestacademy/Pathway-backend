import { describe, expect, it } from '@jest/globals';
import { ContentType } from '../../generated/prisma/client';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › findOpenSession', () => {
  const ctx = usePublishingTestContext();

  const query = {
    contextType: 'CAREER' as ContentType,
    contextId: 'career-1',
  };

  it('returns null when no open session exists', async () => {
    const { service, prismaMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(null);

    const result = await service.findOpenSession(query, 'user-1');

    expect(result).toBeNull();
    expect(prismaMock.revisionSession.findFirst).toHaveBeenCalledWith({
      where: {
        contextType: 'CAREER',
        contextId: 'career-1',
        createdById: 'user-1',
        status: 'DRAFT',
      },
      select: expect.anything(),
    });
  });

  it('returns the mapped session when one exists', async () => {
    const { service, prismaMock } = ctx();
    prismaMock.revisionSession.findFirst.mockResolvedValue(sessionRow());

    const result = await service.findOpenSession(query, 'user-1');

    expect(result).toMatchObject({
      id: 'session-1',
      status: 'DRAFT',
    });
  });
});
