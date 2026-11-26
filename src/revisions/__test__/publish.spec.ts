import { describe, expect, it } from '@jest/globals';
import { DomainException } from '../../common';
import {
  CareerStatus,
  ContentType,
  RevisionStatus,
  Role,
} from '../../generated/prisma/client';
import { m } from './helpers/strategy';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › publish', () => {
  const ctx = usePublishingTestContext();

  const approvedSession = sessionRow({
    status: RevisionStatus.APPROVED,
    createdCareer: false,
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
    }>,
  ) => {
    txMock.contentRevision.findMany.mockResolvedValue(rows);
  };

  it('does not bump Career.version nor transition the session on a stale publish', async () => {
    // Known service bug (fixed by the publish() rewrite). Flip to `it`
    // once the rewrite is verified green.
    const { service, txMock } = ctx();
    lockTo(txMock, approvedSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0, // currentVersion = 1 → stale
        snapshot: {},
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(1);

    const error = await service
      .publish('session-1', { id: 'actor-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SESSION_STALE' });
    expect((error as DomainException).getStatus()).toBe(409);

    expect(txMock.career.update).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevisionPublishEvent.create).not.toHaveBeenCalled();
  });

  it('returns SESSION_STALE with details when a revision is stale (behavioural)', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, approvedSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(1);

    const error = await service
      .publish('session-1', { id: 'actor-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'SESSION_STALE',
      details: {
        stale: [
          expect.objectContaining({
            revisionId: 'rev-1',
            baseVersion: 0,
            currentVersion: 1,
          }),
        ],
      },
    });
  });

  it('returns PLAN_BLOCKED and writes nothing when a plan has blockers', async () => {
    const { service, txMock, fakeCareerStrategy } = ctx();
    lockTo(txMock, approvedSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    m(fakeCareerStrategy.plan).mockReturnValue({
      operations: [],
      blockers: [
        { code: 'LEARNERS_IN_PROGRESS', message: 'x', section: 'career' },
      ],
      advisories: [],
      stale: false,
    });

    const error = await service
      .publish('session-1', { id: 'actor-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'PLAN_BLOCKED' });
    expect(txMock.career.update).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevisionPublishEvent.create).not.toHaveBeenCalled();
  });

  it('locks every revision root before reading versions or live rows', async () => {
    const { service, txMock, fakeCareerStrategy } = ctx();
    lockTo(txMock, approvedSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    txMock.revisionSession.update.mockResolvedValue(approvedSession);

    await service.publish('session-1', { id: 'actor-1', role: Role.EDITOR });

    const lockOrder = m(fakeCareerStrategy.lock).mock.invocationCallOrder[0];
    expect(fakeCareerStrategy.lock).toHaveBeenCalledWith(txMock, 'career-1');
    expect(lockOrder).toBeLessThan(
      txMock.contentRevisionPublishEvent.count.mock.invocationCallOrder[0],
    );
    expect(lockOrder).toBeLessThan(
      m(fakeCareerStrategy.loadLive).mock.invocationCallOrder[0],
    );
  });

  it('returns INVALID_SESSION_STATE when the session is not APPROVED', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, sessionRow({ status: RevisionStatus.DRAFT }));

    const error = await service
      .publish('session-1', { id: 'actor-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect(txMock.career.update).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevisionPublishEvent.create).not.toHaveBeenCalled();
  });

  it('returns INVALID_SESSION_STATE when the session has no revisions', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, approvedSession);
    seedRevisions(txMock, []);

    const error = await service
      .publish('session-1', { id: 'actor-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect(txMock.career.update).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevisionPublishEvent.create).not.toHaveBeenCalled();
  });

  it('throws UNKNOWN_CONTENT_TYPE_IN_PUBLISH when a revision is not in the publish order', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, approvedSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'BOGUS_TYPE' as ContentType,
        contentId: 'x',
        baseVersion: 0,
        snapshot: {},
      },
    ]);

    const error = await service
      .publish('session-1', { id: 'actor-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'UNKNOWN_CONTENT_TYPE_IN_PUBLISH' });
    expect((error as DomainException).getStatus()).toBe(500);
    expect(txMock.career.update).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevisionPublishEvent.create).not.toHaveBeenCalled();
  });

  it('happy path: bumps version, publishes the revision, transitions the session', async () => {
    const { service, txMock, analyticsMock, fakeCareerStrategy } = ctx();
    const session = sessionRow({
      status: RevisionStatus.APPROVED,
      createdCareer: false,
    });
    lockTo(txMock, session);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: { title: 'x' },
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    txMock.career.update.mockResolvedValue({});
    txMock.revisionSession.update.mockResolvedValue(session);
    txMock.contentRevision.update.mockResolvedValue({});
    txMock.contentRevisionPublishEvent.create.mockResolvedValue({});

    // The test asserts the temp-id `new-1` is resolved to `real-1`, so the
    // strategy's apply() must actually produce that mapping.
    m(fakeCareerStrategy.apply).mockResolvedValue({
      createdIds: new Map<string, string>([['new-1', 'real-1']]),
    });

    const result = await service.publish('session-1', {
      id: 'actor-1',
      role: Role.EDITOR,
    });

    expect(txMock.career.update).toHaveBeenCalledWith({
      where: { id: 'career-1' },
      data: { version: { increment: 1 } },
    });
    expect(txMock.contentRevisionPublishEvent.create).toHaveBeenCalledWith({
      data: {
        contentType: 'CAREER',
        contentId: 'career-1',
        revisionId: 'rev-1',
      },
    });
    expect(txMock.contentRevision.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: expect.objectContaining({ status: RevisionStatus.PUBLISHED }),
    });
    expect(txMock.revisionSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          status: RevisionStatus.PUBLISHED,
        }),
      }),
    );
    expect(result).toMatchObject({
      sessionId: 'session-1',
      status: RevisionStatus.PUBLISHED,
      idMap: { 'new-1': 'real-1' },
      published: [{ contentType: 'CAREER', contentId: 'career-1' }],
    });
    expect(analyticsMock.capture).toHaveBeenCalledWith(
      'revision_session_published',
      'actor-1',
      expect.objectContaining({ sessionId: 'session-1', revisionCount: 1 }),
    );
  });

  it('happy path (createdCareer): sets status PUBLISHED and publishedAt on Career', async () => {
    const { service, txMock, fakeCareerStrategy } = ctx();
    const session = sessionRow({
      status: RevisionStatus.APPROVED,
      createdCareer: true,
    });
    lockTo(txMock, session);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    txMock.career.update.mockResolvedValue({});
    txMock.revisionSession.update.mockResolvedValue(session);
    txMock.contentRevision.update.mockResolvedValue({});
    txMock.contentRevisionPublishEvent.create.mockResolvedValue({});
    m(fakeCareerStrategy.apply).mockResolvedValue({
      createdIds: new Map<string, string>([['new-1', 'real-1']]),
    });

    await service.publish('session-1', {
      id: 'actor-1',
      role: Role.EDITOR,
    });

    expect(txMock.career.update).toHaveBeenCalledWith({
      where: { id: 'career-1' },
      data: expect.objectContaining({
        version: { increment: 1 },
        status: CareerStatus.PUBLISHED,
        publishedAt: expect.any(Date),
      }),
    });
  });

  it('rewrites temp IDs from the previous revision before planning the next', async () => {
    const { service, txMock, fakeCareerStrategy, fakeResourceStrategy } = ctx();
    const session = sessionRow({
      status: RevisionStatus.APPROVED,
      createdCareer: true,
    });
    lockTo(txMock, session);
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
        contentType: 'RESOURCE',
        contentId: 'res-1',
        baseVersion: 0,
        snapshot: { parentId: 'new-1' },
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    txMock.career.update.mockResolvedValue({});
    txMock.revisionSession.update.mockResolvedValue(session);
    txMock.contentRevision.update.mockResolvedValue({});
    txMock.contentRevisionPublishEvent.create.mockResolvedValue({});

    const planCalls: Array<{ snapshot: unknown }> = [];

    (
      fakeCareerStrategy as unknown as { tempIdFields: unknown[] }
    ).tempIdFields = [{ path: 'childId', kind: 'scalar' }];
    m(fakeCareerStrategy.apply).mockResolvedValue({
      createdIds: new Map<string, string>([['new-1', 'real-1']]),
    });
    m(fakeCareerStrategy.plan).mockImplementation((_live, snapshot) => {
      planCalls.push({ snapshot });
      return {
        operations: [],
        blockers: [],
        advisories: [],
        stale: false,
      };
    });

    (
      fakeResourceStrategy as unknown as { tempIdFields: unknown[] }
    ).tempIdFields = [{ path: 'parentId', kind: 'scalar' }];
    m(fakeResourceStrategy.apply).mockResolvedValue({
      createdIds: new Map<string, string>(),
    });
    m(fakeResourceStrategy.plan).mockImplementation((_live, snapshot) => {
      planCalls.push({ snapshot });
      return {
        operations: [],
        blockers: [],
        advisories: [],
        stale: false,
      };
    });

    await service.publish('session-1', {
      id: 'actor-1',
      role: Role.EDITOR,
    });
    console.log('planCalls:', JSON.stringify(planCalls, null, 2));

    expect(planCalls).toHaveLength(2);
    expect(planCalls[1].snapshot).toMatchObject({ parentId: 'real-1' });
  });

  it('locks each revision before applying it', async () => {
    const { service, txMock, fakeCareerStrategy } = ctx();
    const session = sessionRow({
      status: RevisionStatus.APPROVED,
      createdCareer: true,
    });
    lockTo(txMock, session);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    txMock.career.update.mockResolvedValue({});
    txMock.revisionSession.update.mockResolvedValue(session);
    txMock.contentRevision.update.mockResolvedValue({});
    txMock.contentRevisionPublishEvent.create.mockResolvedValue({});
    m(fakeCareerStrategy.apply).mockResolvedValue({
      createdIds: new Map<string, string>(),
    });

    await service.publish('session-1', {
      id: 'actor-1',
      role: Role.EDITOR,
    });

    expect(fakeCareerStrategy.lock).toHaveBeenCalledTimes(1);
    expect(fakeCareerStrategy.apply).toHaveBeenCalledTimes(1);
    expect(m(fakeCareerStrategy.lock).mock.invocationCallOrder[0]).toBeLessThan(
      m(fakeCareerStrategy.apply).mock.invocationCallOrder[0],
    );
  });
});
