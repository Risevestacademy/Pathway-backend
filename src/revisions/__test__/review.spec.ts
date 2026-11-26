import { describe, expect, it } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common';
import {
  ContentType,
  ReviewDecision,
  RevisionStatus,
  Role,
} from '../../generated/prisma/client';
import { sessionRow } from './helpers/mocks';
import { usePublishingTestContext } from './helpers/setup';

describe('PublishingService › review', () => {
  const ctx = usePublishingTestContext();

  const inReviewSession = sessionRow({
    status: RevisionStatus.IN_REVIEW,
    createdById: 'creator-1',
    contextType: 'CAREER',
    contextId: 'career-1',
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

  const reviewer = { id: 'reviewer-1', role: Role.REVIEWER };

  // ── Gate: session not found ────────────────────────────────────────

  it('returns SESSION_NOT_FOUND when the session row is absent, no writes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, null);

    const error = await service
      .review('session-1', reviewer, { decision: ReviewDecision.APPROVED })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(txMock.review.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  // ── Gate: status ──────────────────────────────────────────────────

  it('returns INVALID_SESSION_STATE for a non-IN_REVIEW session, no writes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, sessionRow({ status: RevisionStatus.DRAFT }));

    const error = await service
      .review('session-1', reviewer, { decision: ReviewDecision.APPROVED })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(txMock.review.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  // ── Gate: self-review ─────────────────────────────────────────────

  it('returns SELF_REVIEW_NOT_ALLOWED for a creator-reviewer who is not ADMIN, no writes', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, inReviewSession);

    const error = await service
      .review(
        'session-1',
        { id: 'creator-1', role: Role.REVIEWER },
        { decision: ReviewDecision.APPROVED },
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({ code: 'SELF_REVIEW_NOT_ALLOWED' });
    expect((error as DomainException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(txMock.review.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('ADMIN self-review succeeds', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, inReviewSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    const createdAt = new Date('2026-01-03T00:00:00.000Z');
    txMock.review.create.mockResolvedValue({ id: 'review-1', createdAt });
    txMock.revisionSession.update.mockResolvedValue({
      ...inReviewSession,
      status: RevisionStatus.APPROVED,
    });
    txMock.contentRevision.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.review(
      'session-1',
      { id: 'creator-1', role: Role.ADMIN },
      { decision: ReviewDecision.APPROVED },
    );

    expect(txMock.review.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      reviewId: 'review-1',
      sessionStatus: RevisionStatus.APPROVED,
    });
  });

  // ── Gate: staleness (APPROVED only) ───────────────────────────────

  it('STALE + APPROVED → SESSION_STALE, no review.create, no transitions', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, inReviewSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(1); // stale

    const error = await service
      .review('session-1', reviewer, { decision: ReviewDecision.APPROVED })
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
    expect(txMock.review.create).not.toHaveBeenCalled();
    expect(txMock.revisionSession.update).not.toHaveBeenCalled();
    expect(txMock.contentRevision.updateMany).not.toHaveBeenCalled();
    expect(analyticsMock.capture).not.toHaveBeenCalled();
  });

  it('STALE + REJECTED succeeds (rejection is always allowed)', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, inReviewSession);
    // Stale count is set but the service must not call it for REJECTED.
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(1);
    const createdAt = new Date('2026-01-03T00:00:00.000Z');
    txMock.review.create.mockResolvedValue({ id: 'review-1', createdAt });
    txMock.revisionSession.update.mockResolvedValue({
      ...inReviewSession,
      status: RevisionStatus.REJECTED,
    });
    txMock.contentRevision.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.review('session-1', reviewer, {
      decision: ReviewDecision.REJECTED,
    });

    expect(txMock.review.create).toHaveBeenCalledTimes(1);
    // The staleness query was never run for REJECTED.
    expect(txMock.contentRevisionPublishEvent.count).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      sessionStatus: RevisionStatus.REJECTED,
    });
    // Note is not in the payload (no note was provided), and analytics fires.
    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
  });

  it('STALE + CHANGES_REQUESTED succeeds', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, inReviewSession);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(1);
    const createdAt = new Date('2026-01-03T00:00:00.000Z');
    txMock.review.create.mockResolvedValue({ id: 'review-1', createdAt });
    txMock.revisionSession.update.mockResolvedValue({
      ...inReviewSession,
      status: RevisionStatus.CHANGES_REQUESTED,
    });
    txMock.contentRevision.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.review('session-1', reviewer, {
      decision: ReviewDecision.CHANGES_REQUESTED,
    });

    expect(txMock.review.create).toHaveBeenCalledTimes(1);
    // Staleness query was never run for CHANGES_REQUESTED.
    expect(txMock.contentRevisionPublishEvent.count).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      sessionStatus: RevisionStatus.CHANGES_REQUESTED,
    });
    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
  });

  // ── Happy path ────────────────────────────────────────────────────

  it('APPROVED happy path: full review.create payload, both transitions, analytics without note', async () => {
    const { service, txMock, analyticsMock } = ctx();
    lockTo(txMock, inReviewSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    const createdAt = new Date('2026-01-03T00:00:00.000Z');
    txMock.review.create.mockResolvedValue({ id: 'review-1', createdAt });
    txMock.revisionSession.update.mockResolvedValue({
      ...inReviewSession,
      status: RevisionStatus.APPROVED,
    });
    txMock.contentRevision.updateMany.mockResolvedValue({ count: 1 });

    const note = 'Looks good';
    const result = await service.review('session-1', reviewer, {
      decision: ReviewDecision.APPROVED,
      note,
    });

    // Full review.create payload including the session-scoped revisionId: null.
    expect(txMock.review.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        revisionId: null,
        reviewerId: 'reviewer-1',
        decision: ReviewDecision.APPROVED,
        note,
      },
      select: { id: true, createdAt: true },
    });
    // Both transitions to APPROVED.
    expect(txMock.revisionSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: RevisionStatus.APPROVED },
    });
    expect(txMock.contentRevision.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: { status: RevisionStatus.APPROVED },
    });

    // Analytics carries the decision but NEVER the note.
    expect(analyticsMock.capture).toHaveBeenCalledTimes(1);
    expect(analyticsMock.capture).toHaveBeenCalledWith(
      'revision_session_reviewed',
      'reviewer-1',
      {
        sessionId: 'session-1',
        contextType: 'CAREER',
        contextId: 'career-1',
        decision: ReviewDecision.APPROVED,
      },
    );
    // Defence in depth: the note string does not appear anywhere in the
    // analytics payload, no matter how deep.
    expect(JSON.stringify(analyticsMock.capture.mock.calls)).not.toContain(
      note,
    );

    // Response echoes note + session-scoped revisionId: null.
    expect(result).toMatchObject({
      reviewId: 'review-1',
      revisionId: null,
      decision: ReviewDecision.APPROVED,
      note,
      sessionStatus: RevisionStatus.APPROVED,
      createdAt,
    });
  });

  it('no-note APPROVED: review.create.note is null, response.note is null', async () => {
    const { service, txMock } = ctx();
    lockTo(txMock, inReviewSession);
    seedRevisions(txMock, [
      {
        id: 'rev-1',
        contentType: 'CAREER',
        contentId: 'career-1',
        baseVersion: 0,
      },
    ]);
    txMock.contentRevisionPublishEvent.count.mockResolvedValue(0);
    const createdAt = new Date('2026-01-03T00:00:00.000Z');
    txMock.review.create.mockResolvedValue({ id: 'review-1', createdAt });
    txMock.revisionSession.update.mockResolvedValue({
      ...inReviewSession,
      status: RevisionStatus.APPROVED,
    });
    txMock.contentRevision.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.review('session-1', reviewer, {
      decision: ReviewDecision.APPROVED,
    });

    expect(txMock.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: null }),
      }),
    );
    expect(result.note).toBeNull();
  });
});
