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

describe('PublishingService › buildDiff', () => {
  const ctx = usePublishingTestContext();

  const inReviewSession = sessionRow({
    status: RevisionStatus.IN_REVIEW,
    createdById: 'creator-1',
    contextType: 'CAREER',
    contextId: 'career-1',
    submittedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  it('returns SESSION_NOT_FOUND when the session row is absent', async () => {
    const { service, txMock } = ctx();
    txMock.revisionSession.findUnique.mockResolvedValue(null);

    const error = await service
      .buildDiff('missing', { id: 'user-1', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('returns FORBIDDEN for a non-creator with a below-REVIEWER role', async () => {
    const { service, txMock, prismaMock } = ctx();
    txMock.revisionSession.findUnique.mockResolvedValue(inReviewSession);
    txMock.contentRevision.findMany.mockResolvedValue([]);
    // loadSessionOwner runs after the tx on prismaMock.
    prismaMock.revisionSession.findUniqueOrThrow.mockResolvedValue({
      createdById: 'creator-1',
    });

    const error = await service
      .buildDiff('session-1', { id: 'user-2', role: Role.EDITOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('dedupes blockers by code+entityId, ORs stale across revisions, and resolves submittedBy', async () => {
    const { service, txMock, prismaMock, fakeCareerStrategy } = ctx();
    txMock.revisionSession.findUnique.mockResolvedValue(inReviewSession);
    txMock.contentRevision.findMany.mockResolvedValue([
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0, // stale vs current = 1
        snapshot: {},
        createdBy: { profile: { firstName: 'Ada', lastName: 'Bello' } },
      },
      {
        id: 'rev-2',
        contentType: 'CAREER',
        contentId: 'career-2',
        baseVersion: 2, // fresh vs current = 2
        snapshot: {},
        createdBy: { profile: { firstName: 'Ada', lastName: 'Bello' } },
      },
    ]);
    // Per-revision staleness: rev-1 → 1, rev-2 → 2.
    txMock.contentRevisionPublishEvent.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    // Same blocker emitted by both revisions — must dedupe to one entry.
    m(fakeCareerStrategy.plan).mockReturnValue({
      operations: [],
      blockers: [
        {
          code: 'DUP',
          message: 'dup',
          section: 'career',
          entityId: 'e-1',
        },
      ],
      advisories: [],
      stale: false,
    });
    m(fakeCareerStrategy.diff).mockResolvedValue([]);

    // The Career title fallback query.
    txMock.career.findUnique.mockResolvedValue({ title: 'Engineer' });
    prismaMock.revisionSession.findUniqueOrThrow.mockResolvedValue({
      createdById: 'creator-1',
    });

    const result = await service.buildDiff('session-1', {
      id: 'creator-1',
      role: Role.EDITOR,
    });

    // OR-stale: rev-1 stale, rev-2 fresh → session stale = true.
    expect(result.stale).toBe(true);
    // Both plan calls contributed a DUP blocker; dedupe leaves one.
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toMatchObject({ code: 'DUP', entityId: 'e-1' });
    // submittedBy comes from the first revision's createdBy.profile.
    expect(result.submittedBy).toBe('Ada Bello');
    // liveVersion / baseVersion take the max across revisions.
    expect(result.baseVersion).toBe(2); // max(0, 2)
    expect(result.liveVersion).toBe(2); // max(1, 2)
  });

  it('contextTitle: strategy.titleFor wins when it returns a real title', async () => {
    const { service, txMock, prismaMock, fakeCareerStrategy } = ctx();
    txMock.revisionSession.findUnique.mockResolvedValue(inReviewSession);
    txMock.contentRevision.findMany.mockResolvedValue([
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: {},
        createdBy: { profile: { firstName: null, lastName: null } },
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    m(fakeCareerStrategy.titleFor).mockReturnValue('Senior Engineer');
    m(fakeCareerStrategy.diff).mockResolvedValue([]);
    prismaMock.revisionSession.findUniqueOrThrow.mockResolvedValue({
      createdById: 'creator-1',
    });

    const result = await service.buildDiff('session-1', {
      id: 'creator-1',
      role: Role.EDITOR,
    });

    expect(result.contextTitle).toBe('Senior Engineer');
    // No Career title lookup when titleFor already produced a title.
    expect(txMock.career.findUnique).not.toHaveBeenCalled();
    // submittedBy is null when both name parts are absent.
    expect(result.submittedBy).toBeNull();
  });

  it("plans each revision with its session's career", async () => {
    const { service, txMock, prismaMock, fakeCareerStrategy } = ctx();
    txMock.revisionSession.findUnique.mockResolvedValue(inReviewSession);
    txMock.contentRevision.findMany.mockResolvedValue([
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
        snapshot: { title: 'x' },
        careerId: 'career-1',
        createdBy: { profile: { firstName: null, lastName: null } },
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    m(fakeCareerStrategy.diff).mockResolvedValue([]);
    prismaMock.revisionSession.findUniqueOrThrow.mockResolvedValue({
      createdById: 'creator-1',
    });

    await service.buildDiff('session-1', {
      id: 'creator-1',
      role: Role.EDITOR,
    });

    expect(fakeCareerStrategy.plan).toHaveBeenCalledWith(
      null,
      { title: 'x' },
      0,
      { careerId: 'career-1' },
    );
  });
});
