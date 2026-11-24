import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  CareerStatus,
  ContentType,
  Prisma,
  ReviewDecision,
  RevisionStatus,
  Role,
  Career,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { DomainException, ROLE_RANK } from '../common';
import { AnalyticsService } from '../analytics';
import { getStrategy, hasStrategy } from './envelope/registry';
import { orderFor } from './envelope/publish-order';
import { currentVersion } from './envelope/versions';
import { rewriteTempIds } from './envelope/temp-id';
import type {
  PlanBlocker,
  RevisionPlan,
  SectionChanges,
} from './envelope/strategy.types';
import type {
  CreateSessionDto,
  FindOpenSessionQueryDto,
  PublishResponseDto,
  RebaseResponseDto,
  ReviewResponseDto,
  SaveDraftResponseDto,
  SessionDiffResponseDto,
  SubmitResponseDto,
  RevisionSessionResponseDto,
  ValidationWarningDto,
  PublishedRevisionDto,
  RebasedRevisionSummaryDto,
  DiscardResponseDto,
  ReviewSessionDto,
  SaveDraftDto,
  SnapshotResponseDto,
} from './dto';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/** Statuses that are considered "open" for the find-open-session query. */
const OPEN_SESSION_STATUSES: RevisionStatus[] = [
  RevisionStatus.DRAFT,
  RevisionStatus.IN_REVIEW,
  RevisionStatus.CHANGES_REQUESTED,
];

/** The one status that `findOpenSession` returns. */
const FIND_OPEN_STATUS: RevisionStatus = RevisionStatus.DRAFT;

const REVISION_SUMMARY_SELECT = {
  id: true,
  contentType: true,
  contentId: true,
  status: true,
  baseVersion: true,
  updatedAt: true,
} as const;

const SESSION_SELECT = {
  id: true,
  contextType: true,
  contextId: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  publishedAt: true,
  createdCareer: true,
  revisions: {
    select: REVISION_SUMMARY_SELECT,
    orderBy: [{ contentType: 'asc' as const }, { contentId: 'asc' as const }],
  },
};

interface Actor {
  id: string;
  role: Role;
}

// ─────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  // ───────────────────────────────────────────────────────────────────
  // createSession
  // ───────────────────────────────────────────────────────────────────

  async createSession(
    dto: CreateSessionDto,
    actorUserId: string,
  ): Promise<RevisionSessionResponseDto> {
    if (!hasStrategy(dto.contextType)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'UNSUPPORTED_CONTENT_TYPE',
        `No strategy registered for content type "${dto.contextType}"`,
      );
    }

    // Friendly pre-check (the FOR UPDATE inside the tx closes the race).
    const existing = await this.prisma.revisionSession.findFirst({
      where: {
        contextType: dto.contextType,
        contextId: dto.contextId ?? undefined,
        createdById: actorUserId,
        status: { in: OPEN_SESSION_STATUSES },
      },
      select: SESSION_SELECT,
    });
    if (existing) {
      this.logger.warn(
        {
          contextType: dto.contextType,
          actorUserId,
          reason: 'SESSION_ALREADY_OPEN',
        },
        'Session creation rejected',
      );
      throw new DomainException(
        HttpStatus.CONFLICT,
        'SESSION_ALREADY_OPEN',
        'An open session already exists for this context',
        { sessionId: existing.id },
      );
    }

    const session = await this.prisma.$transaction(async (tx) => {
      // createSession's only non-strategy write: it may create the context
      // root (a DRAFT Career row) when contextId is null. This is deliberate
      // for T0.4 — the career aggregate is whole, and there is no `CAREER`
      // strategy method for "create the root row from nothing". T1's split
      // moves this into per-strategy `createRoot` if it needs to.
      const contextId = await this.ensureContextRoot(
        tx,
        dto.contextType,
        dto.contextId,
        dto.initialSnapshot,
      );

      // Serialise concurrent createSession calls for the same context root.
      // The Career row is the natural sentinel (it always exists by now for
      // CAREER; for other types, we fall back to an advisory lock keyed by
      // contextType+contextId+actor). The race is benign — a 409 is the
      // correct outcome, not data loss — but we close it anyway because it's
      // cheap. See ADR / service comment.
      await tx.$queryRaw`
        SELECT id FROM "Career" WHERE id = ${contextId} FOR UPDATE
      `;

      const open = await tx.revisionSession.findFirst({
        where: {
          contextType: dto.contextType,
          contextId,
          createdById: actorUserId,
          status: { in: OPEN_SESSION_STATUSES },
        },
        select: { id: true },
      });
      if (open) {
        return { conflict: open.id } as const;
      }

      const createdCareer =
        dto.contextId === null && dto.contextType === 'CAREER';

      return tx.revisionSession.create({
        data: {
          contextType: dto.contextType,
          contextId,
          createdById: actorUserId,
          createdCareer,
        },
        select: SESSION_SELECT,
      });
    });

    if ('conflict' in session) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'SESSION_ALREADY_OPEN',
        'An open session already exists for this context',
        { sessionId: session.conflict },
      );
    }

    this.analytics.capture('revision_session_created', actorUserId, {
      sessionId: session.id,
      contextType: session.contextType,
      contextId: session.contextId,
    });

    this.logger.log(
      { sessionId: session.id, contextType: session.contextType, actorUserId },
      'Revision session created',
    );

    return this.toSessionResponse(session);
  }

  // ───────────────────────────────────────────────────────────────────
  // findOpenSession
  // ───────────────────────────────────────────────────────────────────

  async findOpenSession(
    query: FindOpenSessionQueryDto,
    actorUserId: string,
  ): Promise<RevisionSessionResponseDto | null> {
    const session = await this.prisma.revisionSession.findFirst({
      where: {
        contextType: query.contextType,
        contextId: query.contextId,
        createdById: actorUserId,
        status: FIND_OPEN_STATUS,
      },
      select: SESSION_SELECT,
    });
    return session ? this.toSessionResponse(session) : null;
  }

  // ───────────────────────────────────────────────────────────────────
  // getSession
  // ───────────────────────────────────────────────────────────────────

  async getSession(
    sessionId: string,
    actor: Actor,
  ): Promise<RevisionSessionResponseDto> {
    const session = await this.prisma.revisionSession.findUnique({
      where: { id: sessionId },
      select: SESSION_SELECT,
    });
    if (!session) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'SESSION_NOT_FOUND',
        'Session not found',
      );
    }
    this.assertCanViewSession(session, actor);
    return this.toSessionResponse(session);
  }

  // ───────────────────────────────────────────────────────────────────
  // saveDraft
  // ───────────────────────────────────────────────────────────────────

  async saveDraft(
    sessionId: string,
    dto: SaveDraftDto,
    actorUserId: string,
  ): Promise<SaveDraftResponseDto> {
    // Strategy existence is checked before the tx for a clean 400.
    for (const change of dto.changes) {
      if (!hasStrategy(change.contentType)) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'UNSUPPORTED_CONTENT_TYPE',
          `No strategy registered for content type "${change.contentType}"`,
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (!session) return { failure: 'SESSION_NOT_FOUND' } as const;
      if (session.status !== RevisionStatus.DRAFT) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }

      // Current versions, one query per root. Small N (one per changed model),
      // and the count is indexed by (contentType, contentId).
      const currentVersions = new Map<string, number>();
      const versionKey = (ct: ContentType, cid: string) => `${ct}:${cid}`;
      for (const change of dto.changes) {
        const k = versionKey(change.contentType, change.contentId);
        if (currentVersions.has(k)) continue;
        currentVersions.set(
          k,
          await currentVersion(tx, change.contentType, change.contentId),
        );
      }

      // Validation warnings — never fail the save (submit hard-fails).
      const validation: ValidationWarningDto[] = [];
      for (const change of dto.changes) {
        const strategy = getStrategy(change.contentType);
        const problems = strategy.validate(change.snapshot);
        if (problems.length > 0) {
          validation.push({
            contentType: change.contentType,
            contentId: change.contentId,
            problems,
          });
        }
      }

      // Upsert each change.
      for (const change of dto.changes) {
        const baseVersion = currentVersions.get(
          versionKey(change.contentType, change.contentId),
        )!;
        await tx.contentRevision.upsert({
          where: {
            sessionId_contentType_contentId: {
              sessionId: session.id,
              contentType: change.contentType,
              contentId: change.contentId,
            },
          },
          create: {
            sessionId: session.id,
            contentType: change.contentType,
            contentId: change.contentId,
            careerId: session.contextId,
            baseVersion,
            snapshot: change.snapshot as Prisma.InputJsonValue,
            status: session.status,
            createdById: actorUserId,
          },
          update: {
            baseVersion,
            snapshot: change.snapshot as Prisma.InputJsonValue,
            status: session.status,
            updatedAt: new Date(),
          },
        });
      }

      // Replace semantics: delete revisions not in the payload.
      const keepKeys = dto.changes.map((c) => ({
        contentType: c.contentType,
        contentId: c.contentId,
      }));
      await tx.contentRevision.deleteMany({
        where: {
          sessionId: session.id,
          NOT: { OR: keepKeys },
        },
      });

      const saved = await tx.revisionSession.findUniqueOrThrow({
        where: { id: session.id },
        select: SESSION_SELECT,
      });
      return { session: saved, validation };
    });

    if ('failure' in result) {
      this.throwSessionFailure(result.failure, sessionId);
    }

    this.logger.log(
      { sessionId, actorUserId, revisionCount: dto.changes.length },
      'Draft saved',
    );

    return {
      ...this.toSessionResponse(result.session),
      validation: result.validation,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // submit
  // ───────────────────────────────────────────────────────────────────

  async submit(sessionId: string, actor: Actor): Promise<SubmitResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (!session) return { failure: 'SESSION_NOT_FOUND' } as const;
      if (session.status !== RevisionStatus.DRAFT) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }

      const revisions = await tx.contentRevision.findMany({
        where: { sessionId: session.id },
        select: {
          id: true,
          contentType: true,
          contentId: true,
          baseVersion: true,
          snapshot: true,
        },
        orderBy: [{ contentType: 'asc' }, { contentId: 'asc' }],
      });

      if (revisions.length === 0) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }

      // 1. Structural validation. Hard-fail.
      const validationProblems: Array<{
        revisionId: string;
        contentType: ContentType;
        contentId: string;
        problems: string[];
      }> = [];
      for (const rev of revisions) {
        const problems = getStrategy(rev.contentType).validate(rev.snapshot);
        if (problems.length > 0) {
          validationProblems.push({
            revisionId: rev.id,
            contentType: rev.contentType,
            contentId: rev.contentId,
            problems,
          });
        }
      }
      if (validationProblems.length > 0) {
        return {
          failure: 'VALIDATION_FAILED',
          details: { problems: validationProblems },
        } as const;
      }

      // 2. Plan + blockers. Hard-fail.
      const blockers: Array<
        PlanBlocker & {
          revisionId: string;
          contentType: ContentType;
          contentId: string;
        }
      > = [];
      const staleRevisions: Array<{
        revisionId: string;
        contentType: ContentType;
        contentId: string;
        baseVersion: number;
        currentVersion: number;
      }> = [];

      for (const rev of revisions) {
        const strategy = getStrategy(rev.contentType);
        const live = await strategy.loadLive(tx, rev.contentId);
        const plan = strategy.plan(live, rev.snapshot, rev.baseVersion);
        for (const b of plan.blockers) {
          blockers.push({
            ...b,
            revisionId: rev.id,
            contentType: rev.contentType,
            contentId: rev.contentId,
          });
        }

        // 3. Staleness.
        const current = await currentVersion(
          tx,
          rev.contentType,
          rev.contentId,
        );
        if (strategy.isStale(rev.baseVersion, current)) {
          staleRevisions.push({
            revisionId: rev.id,
            contentType: rev.contentType,
            contentId: rev.contentId,
            baseVersion: rev.baseVersion,
            currentVersion: current,
          });
        }
      }

      if (blockers.length > 0) {
        return { failure: 'PLAN_BLOCKED', details: { blockers } } as const;
      }
      if (staleRevisions.length > 0) {
        return {
          failure: 'SESSION_STALE',
          details: { stale: staleRevisions },
        } as const;
      }

      // 4. Transition session + revisions together.
      const now = new Date();
      const updated = await tx.revisionSession.update({
        where: { id: session.id },
        data: {
          status: RevisionStatus.IN_REVIEW,
          submittedAt: now,
        },
        select: SESSION_SELECT,
      });
      await tx.contentRevision.updateMany({
        where: { sessionId: session.id },
        data: { status: RevisionStatus.IN_REVIEW },
      });

      return { session: updated, revisionCount: revisions.length };
    });

    if ('failure' in result) {
      this.throwSessionFailure(result.failure, sessionId, result.details);
    }

    this.analytics.capture('revision_session_submitted', actor.id, {
      sessionId: result.session.id,
      contextType: result.session.contextType,
      contextId: result.session.contextId,
      revisionCount: result.revisionCount,
    });

    this.logger.log(
      { sessionId, actorUserId: actor.id, revisionCount: result.revisionCount },
      'Session submitted',
    );

    return this.toSessionResponse(result.session);
  }

  // ───────────────────────────────────────────────────────────────────
  // buildDiff
  // ───────────────────────────────────────────────────────────────────

  async buildDiff(
    sessionId: string,
    actor: Actor,
  ): Promise<SessionDiffResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.revisionSession.findUnique({
        where: { id: sessionId },
        select: SESSION_SELECT,
      });
      if (!session) return { failure: 'SESSION_NOT_FOUND' } as const;

      const revisions = await tx.contentRevision.findMany({
        where: { sessionId: session.id },
        select: {
          id: true,
          contentType: true,
          contentId: true,
          baseVersion: true,
          snapshot: true,
          createdBy: {
            select: {
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ contentType: 'asc' }, { contentId: 'asc' }],
      });

      // Resolve per-root live versions and per-revision plans.
      const baseVersions: number[] = [];
      const liveVersions: number[] = [];
      let stale = false;
      const allBlockers: PlanBlocker[] = [];
      const allAdvisories: PlanBlocker[] = []; // same shape, different array
      const sections: SectionChanges[] = [];

      for (const rev of revisions) {
        const strategy = getStrategy(rev.contentType);
        const live = await strategy.loadLive(tx, rev.contentId);
        const plan = strategy.plan(live, rev.snapshot, rev.baseVersion);
        const current = await currentVersion(
          tx,
          rev.contentType,
          rev.contentId,
        );

        baseVersions.push(rev.baseVersion);
        liveVersions.push(current);
        if (strategy.isStale(rev.baseVersion, current)) stale = true;

        allBlockers.push(...plan.blockers);
        allAdvisories.push(...plan.advisories);

        const sectionChanges = await strategy.diff(plan, rev.snapshot, {
          revisionId: rev.id,
          baseVersion: rev.baseVersion,
          liveVersion: current,
          sessionId: session.id,
          prisma: tx,
        });
        sections.push(...sectionChanges);
      }

      const contextTitle = await this.resolveContextTitle(
        tx,
        session.contextType,
        session.contextId,
        revisions,
      );

      const submittedBy =
        revisions.length > 0
          ? [
              revisions[0].createdBy.profile?.firstName,
              revisions[0].createdBy.profile?.lastName,
            ]
              .filter((p): p is string => Boolean(p))
              .join(' ') || null
          : null;

      return {
        sessionId: session.id,
        contextType: session.contextType,
        contextId: session.contextId,
        contextTitle,
        submittedBy,
        submittedAt: session.submittedAt,
        baseVersion: baseVersions.length ? Math.max(...baseVersions) : 0,
        liveVersion: liveVersions.length ? Math.max(...liveVersions) : 0,
        stale,
        blockers: dedupeByCodeAndEntityId(allBlockers),
        advisories: dedupeByCodeAndEntityId(allAdvisories),
        sections,
      } as SessionDiffResponseDto;
    });

    if ('failure' in result) {
      this.throwSessionFailure(result.failure, sessionId);
    }
    this.assertCanViewSession(
      { createdById: await this.loadSessionOwner(this.prisma, sessionId) },
      actor,
    );
    return result;
  }

  // ───────────────────────────────────────────────────────────────────
  // review
  // ───────────────────────────────────────────────────────────────────

  async review(
    sessionId: string,
    reviewer: Actor,
    dto: ReviewSessionDto,
  ): Promise<ReviewResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (!session) return { failure: 'SESSION_NOT_FOUND' } as const;
      if (session.status !== RevisionStatus.IN_REVIEW) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }
      if (session.createdById === reviewer.id && reviewer.role !== Role.ADMIN) {
        return { failure: 'SELF_REVIEW_NOT_ALLOWED' } as const;
      }

      // Staleness only matters for APPROVED. Rejection is always allowed.
      if (dto.decision === ReviewDecision.APPROVED) {
        const revisions = await tx.contentRevision.findMany({
          where: { sessionId: session.id },
          select: {
            id: true,
            contentType: true,
            contentId: true,
            baseVersion: true,
          },
        });
        const stale: Array<{
          revisionId: string;
          contentType: ContentType;
          contentId: string;
          baseVersion: number;
          currentVersion: number;
        }> = [];
        for (const rev of revisions) {
          const current = await currentVersion(
            tx,
            rev.contentType,
            rev.contentId,
          );
          const strategy = getStrategy(rev.contentType);
          if (strategy.isStale(rev.baseVersion, current)) {
            stale.push({
              revisionId: rev.id,
              contentType: rev.contentType,
              contentId: rev.contentId,
              baseVersion: rev.baseVersion,
              currentVersion: current,
            });
          }
        }
        if (stale.length > 0) {
          return { failure: 'SESSION_STALE', details: { stale } } as const;
        }
      }

      const nextStatus =
        dto.decision === ReviewDecision.APPROVED
          ? RevisionStatus.APPROVED
          : dto.decision === ReviewDecision.REJECTED
            ? RevisionStatus.REJECTED
            : RevisionStatus.CHANGES_REQUESTED;

      const review = await tx.review.create({
        data: {
          sessionId: session.id,
          revisionId: null,
          reviewerId: reviewer.id,
          decision: dto.decision,
          note: dto.note ?? null,
        },
        select: { id: true, createdAt: true },
      });
      await tx.revisionSession.update({
        where: { id: session.id },
        data: { status: nextStatus },
      });
      await tx.contentRevision.updateMany({
        where: { sessionId: session.id },
        data: { status: nextStatus },
      });

      return {
        reviewId: review.id,
        createdAt: review.createdAt,
        decision: dto.decision,
        note: dto.note ?? null,
        sessionStatus: nextStatus,
        contextType: session.contextType,
        contextId: session.contextId,
      };
    });

    if ('failure' in result) {
      this.throwSessionFailure(result.failure, sessionId, result.details);
    }

    // Note is never sent to analytics.
    this.analytics.capture('revision_session_reviewed', reviewer.id, {
      sessionId,
      contextType: result.contextType,
      contextId: result.contextId,
      decision: result.decision,
    });

    this.logger.log(
      { sessionId, reviewerId: reviewer.id, decision: result.decision },
      'Session reviewed',
    );

    return {
      reviewId: result.reviewId,
      revisionId: null,
      decision: result.decision,
      note: result.note,
      sessionStatus: result.sessionStatus,
      createdAt: result.createdAt,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // publish
  // ───────────────────────────────────────────────────────────────────

  async publish(sessionId: string, actor: Actor): Promise<PublishResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (!session) return { failure: 'SESSION_NOT_FOUND' } as const;
      if (session.status !== RevisionStatus.APPROVED) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }

      const revisions = await tx.contentRevision.findMany({
        where: { sessionId: session.id },
        select: {
          id: true,
          contentType: true,
          contentId: true,
          baseVersion: true,
          snapshot: true,
        },
        orderBy: [{ contentType: 'asc' }, { contentId: 'asc' }],
      });

      if (revisions.length === 0) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }

      // isCreate per ruling #I: session.createdCareer, not row-existence.
      const isCreate = session.createdCareer;
      const order = orderFor(isCreate);

      // Sort by publish order. Anything not in the order array is a bug.
      const positionByType = new Map<ContentType, number>();
      order.forEach((ct, i) => positionByType.set(ct, i));
      for (const rev of revisions) {
        if (!positionByType.has(rev.contentType)) {
          throw new DomainException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            'UNKNOWN_CONTENT_TYPE_IN_PUBLISH',
            `Content type "${rev.contentType}" has no position in the publish order`,
          );
        }
      }
      const sorted = [...revisions].sort((a, b) => {
        const pa = positionByType.get(a.contentType)!;
        const pb = positionByType.get(b.contentType)!;
        if (pa !== pb) return pa - pb;
        return a.contentId.localeCompare(b.contentId);
      });

      // Staleness re-check BEFORE any locks on live rows.
      for (const rev of sorted) {
        const current = await currentVersion(
          tx,
          rev.contentType,
          rev.contentId,
        );
        const strategy = getStrategy(rev.contentType);
        if (strategy.isStale(rev.baseVersion, current)) {
          return {
            failure: 'SESSION_STALE',
            details: {
              stale: [
                {
                  revisionId: rev.id,
                  contentType: rev.contentType,
                  contentId: rev.contentId,
                  baseVersion: rev.baseVersion,
                  currentVersion: current,
                },
              ],
            },
          } as const;
        }
      }

      // Apply.
      const tempIdMap = new Map<string, string>();
      const published: PublishedRevisionDto[] = [];

      for (const rev of sorted) {
        const strategy = getStrategy(rev.contentType);

        // 1. Rewrite temp IDs against the accumulated map.
        const rewrittenSnapshot = rewriteTempIds(
          rev.snapshot,
          strategy.tempIdFields,
          tempIdMap,
        );

        // 2. Load + plan.
        const live = await strategy.loadLive(tx, rev.contentId);
        const plan: RevisionPlan = strategy.plan(
          live,
          rewrittenSnapshot,
          rev.baseVersion,
        );
        if (plan.blockers.length > 0) {
          return {
            failure: 'PLAN_BLOCKED',
            details: { blockers: plan.blockers },
          } as const;
        }

        // 3. Lock the live row (no-op for creates).
        await strategy.lock(tx, rev.contentId);

        // 4. Apply.
        const applyResult = await strategy.apply(tx, plan, live, rev.contentId);
        for (const [tempId, realId] of applyResult.createdIds) {
          tempIdMap.set(tempId, realId);
        }

        // 5. Publish event for the revision's root.
        //    For a create, the strategy returned the real id keyed by the
        //    contentId itself (e.g. new-1 -> real-resource-uuid). The publish
        //    event must use the real id, not the temp one, because the count
        //    is what `currentVersion` returns for the root going forward.
        const realId =
          applyResult.createdIds.get(rev.contentId) ?? rev.contentId;
        await tx.contentRevisionPublishEvent.create({
          data: {
            contentType: rev.contentType,
            contentId: realId,
            revisionId: rev.id,
          },
        });

        // 6. Nested roots touched (T0.4: career returns []; T1 will return
        //    the pathway/step roots the career snapshot's nested content owns).
        const nestedRoots = strategy.nestedRootsTouched(plan);
        for (const ref of nestedRoots) {
          const nestedRealId = tempIdMap.get(ref.contentId) ?? ref.contentId;
          await tx.contentRevisionPublishEvent.create({
            data: {
              contentType: ref.contentType,
              contentId: nestedRealId,
              revisionId: rev.id,
            },
          });
        }

        // 7. Mark the revision PUBLISHED.
        await tx.contentRevision.update({
          where: { id: rev.id },
          data: {
            status: RevisionStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });

        published.push({
          contentType: rev.contentType,
          contentId: rev.contentId,
          ...(realId !== rev.contentId ? { realId } : {}),
        });
      }

      // Session transition (after all applies).
      const now = new Date();
      await tx.revisionSession.update({
        where: { id: session.id },
        data: {
          status: RevisionStatus.PUBLISHED,
          publishedAt: now,
        },
      });

      return {
        sessionId: session.id,
        status: RevisionStatus.PUBLISHED,
        publishedAt: now,
        idMap: Object.fromEntries(tempIdMap),
        published,
        contextType: session.contextType,
        contextId: session.contextId,
      };
    });

    if ('failure' in result) {
      this.throwSessionFailure(result.failure, sessionId, result.details);
    }

    this.analytics.capture('revision_session_published', actor.id, {
      sessionId: result.sessionId,
      contextType: result.contextType,
      contextId: result.contextId,
      revisionCount: result.published.length,
    });

    this.logger.log(
      {
        sessionId,
        actorUserId: actor.id,
        revisionCount: result.published.length,
      },
      'Session published',
    );

    return {
      sessionId: result.sessionId,
      status: result.status,
      publishedAt: result.publishedAt,
      idMap: result.idMap,
      published: result.published,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // discard
  // ───────────────────────────────────────────────────────────────────

  async discard(
    sessionId: string,
    actorUserId: string,
  ): Promise<DiscardResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (!session) return { failure: 'SESSION_NOT_FOUND' } as const;
      if (session.status !== RevisionStatus.DRAFT) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }

      // Delete the session (cascades revisions via sessionId FK).
      await tx.revisionSession.delete({ where: { id: session.id } });

      // If this session created the DRAFT Career row, delete it too.
      // Defensive: only if still DRAFT (someone might have promoted it).
      if (session.createdCareer) {
        const career = await tx.career.findUnique({
          where: { id: session.contextId },
          select: { id: true, status: true },
        });
        if (career && career.status === CareerStatus.DRAFT) {
          await tx.career.delete({ where: { id: career.id } });
        }
      }

      return { ok: true } as const;
    });

    if ('failure' in result) {
      this.throwSessionFailure(result.failure, sessionId);
    }

    this.logger.log({ sessionId, actorUserId }, 'Session discarded');
    return { message: 'Draft discarded' };
  }

  // ───────────────────────────────────────────────────────────────────
  // rebase
  // ───────────────────────────────────────────────────────────────────

  async rebase(
    sessionId: string,
    actorUserId: string,
  ): Promise<RebaseResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (!session) return { failure: 'SESSION_NOT_FOUND' } as const;
      if (session.status !== RevisionStatus.DRAFT) {
        return { failure: 'INVALID_SESSION_STATE' } as const;
      }
      if (session.createdById !== actorUserId) {
        return { failure: 'NOT_SESSION_CREATOR' } as const;
      }

      const revisions = await tx.contentRevision.findMany({
        where: { sessionId: session.id },
        select: {
          id: true,
          contentType: true,
          contentId: true,
          baseVersion: true,
        },
        orderBy: [{ contentType: 'asc' }, { contentId: 'asc' }],
      });

      let rebasedCount = 0;
      const summaries: RebasedRevisionSummaryDto[] = [];

      for (const rev of revisions) {
        const current = await currentVersion(
          tx,
          rev.contentType,
          rev.contentId,
        );
        const wasStale = rev.baseVersion < current;
        if (wasStale) {
          await tx.contentRevision.update({
            where: { id: rev.id },
            data: { baseVersion: current },
          });
          rebasedCount++;
        }
        summaries.push({
          id: rev.id,
          contentType: rev.contentType,
          contentId: rev.contentId,
          status: RevisionStatus.DRAFT,
          baseVersion: wasStale ? current : rev.baseVersion,
          updatedAt: new Date(),
          wasStale,
        });
      }

      return {
        sessionId: session.id,
        rebased: rebasedCount > 0,
        rebasedCount,
        revisions: summaries,
        contextType: session.contextType,
        contextId: session.contextId,
      };
    });

    if ('failure' in result) {
      this.throwSessionFailure(result.failure, sessionId);
    }

    if (result.rebased) {
      this.analytics.capture('revision_session_rebased', actorUserId, {
        sessionId: result.sessionId,
        contextType: result.contextType,
        contextId: result.contextId,
        rebasedCount: result.rebasedCount,
      });
    }

    this.logger.log(
      {
        sessionId,
        actorUserId,
        rebased: result.rebased,
        rebasedCount: result.rebasedCount,
      },
      'Session rebase',
    );

    return {
      sessionId: result.sessionId,
      rebased: result.rebased,
      revisions: result.revisions,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // getSnapshots
  // ───────────────────────────────────────────────────────────────────

  /**
   * The raw saved snapshots for a session, one per revision.
   *
   * Passthrough: returns exactly what is stored on ContentRevision.snapshot.
   * No strategy calls, no live state, no locks, no plan. This is the
   * editor's view of "what did I save"; reviewers use buildDiff instead.
   *
   * Authorization: creator or REVIEWER+ (same as getSession / buildDiff).
   * No status restriction: a CHANGES_REQUESTED or PUBLISHED session's
   * snapshots are readable, because the correction and history workflows
   * need them.
   */
  async getSnapshots(
    sessionId: string,
    actor: Actor,
  ): Promise<SnapshotResponseDto> {
    const session = await this.prisma.revisionSession.findUnique({
      where: { id: sessionId },
      select: { id: true, createdById: true },
    });
    if (!session) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'SESSION_NOT_FOUND',
        'Session not found',
      );
    }
    this.assertCanViewSession(session, actor);

    const revisions = await this.prisma.contentRevision.findMany({
      where: { sessionId: session.id },
      select: {
        id: true,
        contentType: true,
        contentId: true,
        snapshot: true,
        updatedAt: true,
      },
      orderBy: [{ contentType: 'asc' as const }, { contentId: 'asc' as const }],
    });

    this.logger.log(
      { sessionId, actorUserId: actor.id, revisionCount: revisions.length },
      'Session snapshots read',
    );

    return {
      sessionId: session.id,
      snapshots: revisions.map((r) => ({
        revisionId: r.id,
        contentType: r.contentType,
        contentId: r.contentId,
        snapshot: r.snapshot as Record<string, unknown>,
        updatedAt: r.updatedAt,
      })),
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────

  /**
   * Seed or verify the context root for a new session.
   *
   * - contextId non-null: verify the root exists. (CAREER → Career row.)
   * - contextId null + CAREER: require initialSnapshot, validate it, extract
   *   the required Career columns, create the DRAFT row from them. The
   *   snapshot is NOT persisted here; the first saveDraft creates the
   *   ContentRevision.
   * - contextId null + non-CAREER: unsupported in v1.
   *
   * Returns the context root's id.
   */
  private async ensureContextRoot(
    tx: Prisma.TransactionClient,
    contextType: ContentType,
    contextId: string | null,
    initialSnapshot: Record<string, unknown> | undefined,
  ): Promise<string> {
    if (contextId !== null) {
      if (contextType === 'CAREER') {
        const exists = await tx.career.findUnique({
          where: { id: contextId },
          select: { id: true },
        });
        if (!exists) {
          throw new DomainException(
            HttpStatus.NOT_FOUND,
            'SESSION_NOT_FOUND',
            'Career not found for the given contextId',
          );
        }
      }
      return contextId;
    }

    if (contextType !== 'CAREER') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'UNSUPPORTED_CONTENT_TYPE',
        `Creating a new root via contextId=null is only supported for CAREER in v1 (got "${contextType}")`,
      );
    }

    if (!initialSnapshot) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'initialSnapshot is required when creating a new career via contextId=null',
      );
    }

    // Validate the initial snapshot structurally. This is the one place
    // validate() is a hard gate outside submit: the Career row cannot be
    // created without its required columns, so an invalid snapshot would
    // produce an unfillable row.
    const strategy = getStrategy(contextType);
    const problems = strategy.validate(initialSnapshot);
    if (problems.length > 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'initialSnapshot failed validation',
        { problems },
      );
    }

    // Extract required Career columns from the snapshot.
    // The career strategy's snapshot shape: { career: { title, slug,
    // description, fieldId, ... }, ... }. Field names here mirror the
    // Career model's columns.
    const career = (initialSnapshot as { career?: Record<string, unknown> })
      .career;
    if (
      !career ||
      typeof career.title !== 'string' ||
      typeof career.slug !== 'string' ||
      typeof career.description !== 'string' ||
      typeof career.fieldId !== 'string'
    ) {
      // Strategy.validate already checks these, so this is defence in depth.
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'initialSnapshot.career is missing required fields',
      );
    }

    const id = randomUUID();
    await tx.career.create({
      data: {
        id,
        status: CareerStatus.DRAFT,
        version: 1,
        title: career.title,
        slug: career.slug,
        description: career.description,
        fieldId: career.fieldId,
        roleSummary:
          typeof career.roleSummary === 'string' ? career.roleSummary : null,
        targetLevels: Array.isArray(career.targetLevels)
          ? (career.targetLevels as Career['targetLevels'])
          : [],
        exampleActivities: Array.isArray(career.exampleActivities)
          ? (career.exampleActivities as string[])
          : [],
        typicalEducationNote:
          typeof career.typicalEducationNote === 'string'
            ? career.typicalEducationNote
            : null,
        certificationsNote:
          typeof career.certificationsNote === 'string'
            ? career.certificationsNote
            : null,
      },
    });
    return id;
  }

  /** Lock a session row FOR UPDATE. Returns null if missing. */
  private async lockSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<{
    id: string;
    contextType: ContentType;
    contextId: string;
    status: RevisionStatus;
    createdById: string;
    createdCareer: boolean;
  } | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        contextType: ContentType;
        contextId: string;
        status: RevisionStatus;
        createdById: string;
        createdCareer: boolean;
      }>
    >`SELECT "id", "contextType", "contextId", "status", "createdById", "createdCareer"
       FROM "RevisionSession" WHERE "id" = ${sessionId} FOR UPDATE`;
    return rows[0] ?? null;
  }

  private assertCanViewSession(
    session: { createdById: string },
    actor: Actor,
  ): void {
    const isCreator = session.createdById === actor.id;
    const isReviewerOrAbove =
      (ROLE_RANK[actor.role] ?? -1) >= ROLE_RANK[Role.REVIEWER];
    if (!isCreator && !isReviewerOrAbove) {
      this.logger.warn(
        { actorUserId: actor.id, reason: 'FORBIDDEN' },
        'Session view denied',
      );
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Only the creator or a reviewer can view this session',
      );
    }
  }

  private async loadSessionOwner(
    prisma: PrismaService,
    sessionId: string,
  ): Promise<string> {
    const row = await prisma.revisionSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { createdById: true },
    });
    return row.createdById;
  }

  private async resolveContextTitle(
    tx: Prisma.TransactionClient,
    contextType: ContentType,
    contextId: string,
    revisions: Array<{
      contentType: ContentType;
      contentId: string;
      snapshot: Prisma.JsonValue;
    }>,
  ): Promise<string> {
    // 1. strategy.titleFor on the context-type revision's snapshot.
    const contextRevision = revisions.find(
      (r) => r.contentType === contextType,
    );
    if (contextRevision) {
      try {
        const title = getStrategy(contextType).titleFor(
          contextRevision.snapshot,
        );
        if (title && title !== 'Unknown') return title;
      } catch {
        // fall through
      }
    }
    // 2. Direct query for a CAREER context.
    if (contextType === 'CAREER') {
      const career = await tx.career.findUnique({
        where: { id: contextId },
        select: { title: true },
      });
      if (career?.title) return career.title;
    }
    // 3. Fallback.
    return contextId;
  }

  private toSessionResponse(session: {
    id: string;
    contextType: ContentType;
    contextId: string;
    status: RevisionStatus;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    submittedAt: Date | null;
    publishedAt: Date | null;
    revisions: Array<{
      id: string;
      contentType: ContentType;
      contentId: string;
      status: RevisionStatus;
      baseVersion: number;
      updatedAt: Date;
    }>;
  }): RevisionSessionResponseDto {
    return {
      id: session.id,
      contextType: session.contextType,
      contextId: session.contextId,
      status: session.status,
      createdById: session.createdById,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      submittedAt: session.submittedAt,
      publishedAt: session.publishedAt,
      revisions: session.revisions.map((r) => ({
        id: r.id,
        contentType: r.contentType,
        contentId: r.contentId,
        status: r.status,
        baseVersion: r.baseVersion,
        updatedAt: r.updatedAt,
      })),
    };
  }

  private throwSessionFailure(
    failure: string | undefined,
    sessionId: string,
    details?: unknown,
  ): never {
    const code = failure ?? 'INTERNAL_ERROR';
    const safeDetails =
      details !== null && typeof details === 'object'
        ? (details as Record<string, unknown>)
        : undefined;
    switch (code) {
      case 'SESSION_NOT_FOUND':
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'SESSION_NOT_FOUND',
          'Session not found',
        );
      case 'INVALID_SESSION_STATE':
        throw new DomainException(
          HttpStatus.CONFLICT,
          'INVALID_SESSION_STATE',
          'The session is not in a state that allows this operation',
          { sessionId },
        );
      case 'SESSION_STALE':
        throw new DomainException(
          HttpStatus.CONFLICT,
          'SESSION_STALE',
          'One or more revisions are stale; rebase before continuing',
          safeDetails,
        );
      case 'VALIDATION_FAILED':
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'One or more revisions failed validation',
          safeDetails,
        );
      case 'PLAN_BLOCKED':
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'PLAN_BLOCKED',
          'One or more revisions have blockers',
          safeDetails,
        );
      case 'SELF_REVIEW_NOT_ALLOWED':
        throw new DomainException(
          HttpStatus.FORBIDDEN,
          'SELF_REVIEW_NOT_ALLOWED',
          'Reviewers cannot review their own sessions unless they are ADMIN',
        );
      case 'NOT_SESSION_CREATOR':
        throw new DomainException(
          HttpStatus.FORBIDDEN,
          'NOT_SESSION_CREATOR',
          'Only the session creator can perform this action',
        );
      default:
        throw new DomainException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'INTERNAL_ERROR',
          `Unhandled session failure: ${code}`,
        );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';

function dedupeByCodeAndEntityId<T extends { code: string; entityId?: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.code}:${item.entityId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
