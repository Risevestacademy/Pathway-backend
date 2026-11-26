import { describe, expect, it } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common';
import { ContentType, RevisionStatus } from '../../generated/prisma/client';
import { m } from './helpers/strategy';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › saveDraft', () => {
  const ctx = usePublishingTestContext();

  const draftSession = sessionRow({
    status: RevisionStatus.DRAFT,
    createdById: 'user-1',
    contextType: 'CAREER',
    contextId: 'career-1',
  });

  const lockTo = (
    txMock: ReturnType<typeof ctx>['txMock'],
    row: ReturnType<typeof sessionRow> | null,
  ) => {
    txMock.$queryRaw.mockResolvedValueOnce(row ? [row] : []);
  };

  const seedCurrentVersion = (
    txMock: ReturnType<typeof ctx>['txMock'],
    counts: number[],
  ) => {
    let i = 0;
    txMock.contentRevisionPublishEvent.count.mockImplementation(async () => {
      const v = counts[Math.min(i, counts.length - 1)];
      i++;
      return v;
    });
  };

  const baseDto = {
    changes: [
      {
        contentType: 'CAREER' as ContentType,
        contentId: 'career-1',
        snapshot: { title: 'x' },
      },
    ],
  };

  it('throws UNSUPPORTED_CONTENT_TYPE before opening a transaction when a change type is unregistered', async () => {
    const { service, txMock, prismaMock } = ctx();
    const dto = {
      changes: [
        {
          contentType: 'PATHWAY' as ContentType, // not registered in the test suite
          contentId: 'pathway-1',
          snapshot: {},
        },
      ],
    };

    const error = await service
      .saveDraft('session-1', dto, 'user-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'UNSUPPORTED_CONTENT_TYPE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    // No transaction was opened, so no lock, no upsert, no deletes.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.contentRevision.upsert).not.toHaveBeenCalled();
    expect(txMock.contentRevision.deleteMany).not.toHaveBeenCalled();
  });

  it('returns INVALID_SESSION_STATE for a non-DRAFT session, no upserts', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, sessionRow({ status: RevisionStatus.IN_REVIEW }));

    const error = await service
      .saveDraft('session-1', baseDto, 'user-1')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(txMock.contentRevision.upsert).not.toHaveBeenCalled();
    expect(txMock.contentRevision.deleteMany).not.toHaveBeenCalled();
  });

  it('returns NOT_SESSION_CREATOR for a non-creator, no upserts', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, draftSession);

    const error = await service
      .saveDraft('session-1', baseDto, 'someone-else')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'NOT_SESSION_CREATOR' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(txMock.contentRevision.upsert).not.toHaveBeenCalled();
    expect(txMock.contentRevision.deleteMany).not.toHaveBeenCalled();
  });

  it('returns SESSION_NOT_FOUND when the session row is absent, no upserts', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, null);

    const error = await service
      .saveDraft('session-1', baseDto, 'user-1')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(txMock.contentRevision.upsert).not.toHaveBeenCalled();
    expect(txMock.contentRevision.deleteMany).not.toHaveBeenCalled();
  });

  it('warnings do NOT fail the save: upsert still runs and warnings are returned', async () => {
    const { service, txMock, fakeCareerStrategy } = ctx();
    lockTo(txMock, draftSession);
    seedCurrentVersion(txMock, [3]);
    txMock.contentRevision.upsert.mockResolvedValue({});
    txMock.contentRevision.deleteMany.mockResolvedValue({ count: 0 });
    txMock.revisionSession.findUniqueOrThrow.mockResolvedValue(draftSession);
    m(fakeCareerStrategy.validate).mockReturnValue(['MISSING_ROLE_SUMMARY']);

    const result = await service.saveDraft('session-1', baseDto, 'user-1');

    expect(txMock.contentRevision.upsert).toHaveBeenCalledTimes(1);
    expect(result.validation).toEqual([
      {
        contentType: 'CAREER',
        contentId: 'career-1',
        problems: ['MISSING_ROLE_SUMMARY'],
      },
    ]);
  });

  it('happy path: upsert create/update payload, deleteMany replace semantics, no analytics', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    seedCurrentVersion(txMock, [3]);
    txMock.contentRevision.upsert.mockResolvedValue({});
    txMock.contentRevision.deleteMany.mockResolvedValue({ count: 0 });
    txMock.revisionSession.findUniqueOrThrow.mockResolvedValue(draftSession);

    const dto = {
      changes: [
        {
          contentType: 'CAREER' as ContentType,
          contentId: 'career-keep',
          snapshot: { title: 'kept' },
        },
      ],
    };

    await service.saveDraft('session-1', dto, 'user-1');

    // Upsert where uses the compound unique key.
    expect(txMock.contentRevision.upsert).toHaveBeenCalledWith({
      where: {
        sessionId_contentType_contentId: {
          sessionId: 'session-1',
          contentType: 'CAREER',
          contentId: 'career-keep',
        },
      },
      create: expect.objectContaining({
        sessionId: 'session-1',
        contentType: 'CAREER',
        contentId: 'career-keep',
        careerId: 'career-1',
        baseVersion: 3,
        snapshot: { title: 'kept' },
        status: RevisionStatus.DRAFT,
        createdById: 'user-1',
      }),
      update: expect.objectContaining({
        baseVersion: 3,
        snapshot: { title: 'kept' },
        status: RevisionStatus.DRAFT,
        updatedAt: expect.any(Date),
      }),
    });

    // Replace semantics: delete everything except the kept keys.
    expect(txMock.contentRevision.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: 'session-1',
        NOT: {
          OR: [{ contentType: 'CAREER', contentId: 'career-keep' }],
        },
      },
    });

    // saveDraft emits no analytics — only the logger.
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('captures baseVersion per unique (contentType, contentId) pair', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, draftSession);
    // Two distinct roots → two currentVersion calls.
    seedCurrentVersion(txMock, [5, 9]);
    txMock.contentRevision.upsert.mockResolvedValue({});
    txMock.contentRevision.deleteMany.mockResolvedValue({ count: 0 });
    txMock.revisionSession.findUniqueOrThrow.mockResolvedValue(draftSession);

    const dto = {
      changes: [
        {
          contentType: 'CAREER' as ContentType,
          contentId: 'career-a',
          snapshot: {},
        },
        {
          contentType: 'CAREER' as ContentType,
          contentId: 'career-b',
          snapshot: {},
        },
      ],
    };

    await service.saveDraft('session-1', dto, 'user-1');

    expect(txMock.contentRevisionPublishEvent.count).toHaveBeenCalledTimes(2);
    expect(txMock.contentRevision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ baseVersion: 5 }),
        update: expect.objectContaining({ baseVersion: 5 }),
      }),
    );
    expect(txMock.contentRevision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ baseVersion: 9 }),
        update: expect.objectContaining({ baseVersion: 9 }),
      }),
    );
  });

  it('dedupes currentVersion per (contentType, contentId) — repeated keys hit count once', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, draftSession);
    seedCurrentVersion(txMock, [4]);
    txMock.contentRevision.upsert.mockResolvedValue({});
    txMock.contentRevision.deleteMany.mockResolvedValue({ count: 0 });
    txMock.revisionSession.findUniqueOrThrow.mockResolvedValue(draftSession);

    const dto = {
      changes: [
        {
          contentType: 'CAREER' as ContentType,
          contentId: 'career-a',
          snapshot: {},
        },
        {
          contentType: 'CAREER' as ContentType,
          contentId: 'career-a', // duplicate
          snapshot: {},
        },
      ],
    };

    await service.saveDraft('session-1', dto, 'user-1');

    // count is called once for the deduped key, despite two changes.
    expect(txMock.contentRevisionPublishEvent.count).toHaveBeenCalledTimes(1);
    // Both upserts still run.
    expect(txMock.contentRevision.upsert).toHaveBeenCalledTimes(2);
  });
});
