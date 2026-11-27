import { describe, expect, it } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common';
import {
  ContentType,
  RevisionStatus,
  Role,
} from '../../generated/prisma/client';
import { m } from './helpers/strategy';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › submit', () => {
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
      snapshot: unknown;
      careerId?: string;
    }>,
  ) => {
    txMock.contentRevision.findMany.mockResolvedValue(rows);
  };

  it('returns VALIDATION_FAILED with per-revision problems and writes nothing', async () => {
    const { service, txMock, analyticsMock, fakeCareerStrategy } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    m(fakeCareerStrategy.validate).mockReturnValue(['MISSING_TITLE']);

    const error = await service
      .submit('session-1', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        problems: [
          {
            revisionId: 'rev-1',
            contentType: 'CAREER',
            contentId: 'career-1',
            problems: ['MISSING_TITLE'],
          },
        ],
      },
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.BAD_REQUEST);

    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it("plans each revision with its session's career", async () => {
    const { service, txMock, fakeCareerStrategy } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: { title: 'x' },
        careerId: 'career-1',
      },
    ]);

    await service
      .submit('session-1', { id: 'user-1', role: Role.EDITOR })
      .catch(() => undefined);

    expect(fakeCareerStrategy.plan).toHaveBeenCalledWith(
      null,
      { title: 'x' },
      0,
      { careerId: 'career-1' },
    );
  });

  it('returns PLAN_BLOCKED with per-revision blockers and writes nothing', async () => {
    const { service, txMock, analyticsMock, fakeCareerStrategy } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    m(fakeCareerStrategy.plan).mockReturnValue({
      operations: [],
      blockers: [
        {
          code: 'LEARNERS_IN_PROGRESS',
          message: 'x',
          section: 'career',
          entityId: 'entity-1',
          learnersAffected: 3,
        },
      ],
      advisories: [],
      stale: false,
    });
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);

    const error = await service
      .submit('session-1', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'PLAN_BLOCKED',
      details: {
        blockers: [
          {
            code: 'LEARNERS_IN_PROGRESS',
            message: 'x',
            section: 'career',
            entityId: 'entity-1',
            learnersAffected: 3,
            revisionId: 'rev-1',
            contentType: 'CAREER',
            contentId: 'career-1',
          },
        ],
      },
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.BAD_REQUEST);

    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns SESSION_STALE with per-revision stale details and writes nothing', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    // No blockers (default plan); stale by count = 1.
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(1);

    const error = await service
      .submit('session-1', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'SESSION_STALE',
      details: {
        stale: [
          {
            revisionId: 'rev-1',
            contentType: 'CAREER',
            contentId: 'career-1',
            baseVersion: 0,
            currentVersion: 1,
          },
        ],
      },
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);

    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns INVALID_SESSION_STATE for an empty session, no writes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, []);

    const error = await service
      .submit('session-1', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'INVALID_SESSION_STATE',
      details: { sessionId: 'session-1' },
    });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);

    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns INVALID_SESSION_STATE for a non-DRAFT session, no writes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, sessionRow({ status: RevisionStatus.IN_REVIEW }));

    const error = await service
      .submit('session-1', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('returns SESSION_NOT_FOUND when the session row is absent, no writes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, null);

    const error = await service
      .submit('session-1', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('happy path: transitions session and revisions, fires analytics with the full payload', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, draftSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
      {
        id: 'rev-2',
        contentType: 'CAREER',
        contentId: 'career-2',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    // Both roots fresh (count = 0).
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);

    const submitted = {
      ...draftSession,
      status: RevisionStatus.IN_REVIEW,
      submittedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    txMock.revisionSession.update.mockResolvedValue(submitted);
    txMock.contentRevision.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.submit('session-1', {
      id: 'user-1',
      role: Role.EDITOR,
    });

    // Both transitions, same transaction.
    expect(txMock.revisionSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        status: RevisionStatus.IN_REVIEW,
        submittedAt: expect.any(Date),
      },
      select: expect.anything(),
    });
    expect(txMock.contentRevision.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: { status: RevisionStatus.IN_REVIEW },
    });

    // Full analytics payload (not a subset — catches dropped fields).
    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
    expect(analyticsMock.capture).toHaveBeenCalledWith(
      'revision_session_submitted',
      'user-1',
      {
        sessionId: 'session-1',
        contextType: 'CAREER',
        contextId: 'career-1',
        revisionCount: 2,
      },
    );

    // Response echoes the transitioned session.
    expect(result).toMatchObject({
      id: 'session-1',
      status: RevisionStatus.IN_REVIEW,
    });
  });
});
