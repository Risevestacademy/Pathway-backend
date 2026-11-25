import { describe, expect, it } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common';
import { Role } from '../../generated/prisma/client';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › getSession', () => {
  const ctx = usePublishingTestContext();

  it('returns SESSION_NOT_FOUND when the session row is absent', async () => {
    const { service, prismaMock } = ctx();
    prismaMock.revisionSession.findUnique.mockResolvedValue(null);

    const error = await service
      .getSession('missing', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('returns FORBIDDEN for a non-creator with a below-REVIEWER role', async () => {
    const { service, prismaMock } = ctx();
    prismaMock.revisionSession.findUnique.mockResolvedValue(
      sessionRow({ createdById: 'creator-1' }),
    );

    const error = await service
      .getSession('session-1', { id: 'user-2', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('creator sees it, even with EDITOR role', async () => {
    const { service, prismaMock } = ctx();
    const row = sessionRow({ createdById: 'user-1' });
    prismaMock.revisionSession.findUnique.mockResolvedValue(row);

    const result = await service.getSession('session-1', {
      id: 'user-1',
      role: Role.EDITOR,
    });

    expect(result).toMatchObject({
      id: 'session-1',
      createdById: 'user-1',
    });
  });

  it('non-creator with REVIEWER role sees it', async () => {
    const { service, prismaMock } = ctx();
    prismaMock.revisionSession.findUnique.mockResolvedValue(
      sessionRow({ createdById: 'creator-1' }),
    );

    const result = await service.getSession('session-1', {
      id: 'reviewer-1',
      role: Role.REVIEWER,
    });

    expect(result).toMatchObject({
      id: 'session-1',
      createdById: 'creator-1',
    });
  });
});
