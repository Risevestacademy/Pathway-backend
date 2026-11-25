import { describe, expect, it } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common';
import { ContentType, RevisionStatus } from '../../generated/prisma/client';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › rebase', () => {
  const ctx = usePublishingTestContext();

  const draftSession = sessionRow({
    status: RevisionStatus.DRAFT,
    createdById: 'user-1',
  });

  const lockTo = (
    txMock: ReturnType<typeof ctx>['txMock'],
    row: ReturnType<typeof sessionRow> | null,
  ) => {
    txMock.$queryRaw.mockResolvedValueOnce(row ? [row] : []);
  };

  const seedRevisions = (
    txMock: ReturnType<typeof ctx>['txMock'],
    rows: Array<{
      id: string;
      contentType: ContentType;
      contentId: string;
      baseVersion: number;
    }>,
  ) => {
    txMock.contentRevision.findMany.mockResolvedValue(rows);
  };

  it('returns rebased:false and writes nothing when no revision is stale', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 2,
      },
    ]);
    // currentVersion = 2 → baseVersion === current → fresh.
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(2);

    const result = await service.rebase('session-1', 'user-1');

    expect(result).toMatchObject({ rebased: false });
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]).toMatchObject({
      id: 'rev-1',
      wasStale: false,
      baseVersion: 2,
    });
    expect(txMock.contentRevision.update).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('updates every stale revision and fires analytics once with rebasedCount', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
      },
      {
        id: 'rev-2',
        contentType: 'CAREER',
        contentId: 'career-2',
        baseVersion: 0,
      },
    ]);
    // currentVersion = 3 for both roots.
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(3);
    txMock.contentRevision.update.mockResolvedValue({});

    const result = await service.rebase('session-1', 'user-1');

    expect(txMock.contentRevision.update).toHaveBeenCalledTimes(2);
    expect(txMock.contentRevision.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: { baseVersion: 3 },
    });
    expect(txMock.contentRevision.update).toHaveBeenCalledWith({
      where: { id: 'rev-2' },
      data: { baseVersion: 3 },
    });
    expect(result).toMatchObject({ rebased: true });
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions.every((r) => r.wasStale)).toBe(true);
    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
    expect(analyticsMock.capture).toHaveBeenCalledWith(
      'revision_session_rebased',
      'user-1',
      expect.objectContaining({
        sessionId: 'session-1',
        contextType: 'CAREER',
        contextId: 'career-1',
        rebasedCount: 2,
      }),
    );
  });

  it('mixed: only the stale revision is updated, fresh untouched, wasStale per revision', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0, // stale vs current = 2
      },
      {
        id: 'rev-2',
        contentType: 'CAREER',
        contentId: 'career-2',
        baseVersion: 2, // fresh vs current = 2
      },
    ]);
    // Both roots return 2 (same count in the mock).
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(2);
    txMock.contentRevision.update.mockResolvedValue({});

    const result = await service.rebase('session-1', 'user-1');

    expect(txMock.contentRevision.update).toHaveBeenCalledTimes(1);
    expect(txMock.contentRevision.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: { baseVersion: 2 },
    });

    const byId = Object.fromEntries(result.revisions.map((r) => [r.id, r]));
    expect(byId['rev-1']).toMatchObject({ wasStale: true, baseVersion: 2 });
    expect(byId['rev-2']).toMatchObject({ wasStale: false, baseVersion: 2 });

    expect(result).toMatchObject({ rebased: true });
    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
  });

  it('returns INVALID_SESSION_STATE for a non-DRAFT session, no writes, no analytics', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, sessionRow({ status: RevisionStatus.IN_REVIEW }));

    const error = await service
      .rebase('session-1', 'user-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(txMock.contentRevision.update).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns NOT_SESSION_CREATOR for a non-creator, no writes, no analytics', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);

    const error = await service
      .rebase('session-1', 'someone-else')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'NOT_SESSION_CREATOR' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(txMock.contentRevision.update).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns SESSION_NOT_FOUND when the session row is absent, no writes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, null);

    const error = await service
      .rebase('session-1', 'user-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(txMock.contentRevision.update).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });
});
