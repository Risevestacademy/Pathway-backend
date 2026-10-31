import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CareerStatus,
  ReviewDecision,
  RevisionStatus,
  Role,
  Prisma,
} from '../../generated/prisma/client';
import { ROLE_RANK } from '../../common';
import { PrismaService } from '../../prisma';
import { DomainException } from '../../common';
import { buildPlan } from './career-snapshot.plan';
import { findSnapshotProblems } from './career-snapshot.consistency';
import type {
  CareerSnapshot,
  LiveCareerForPlan,
  CareerPlan,
  LiveResource,
  PlanOperation,
} from './career-snapshot.types';
import { ReviewerDiffFormatter } from './reviewer-diff.formatter';
import type { ReviewerDiffResponseDto } from './dto/reviewer-diff-response.dto';
import type { SaveDraftRevisionResponseDto } from './dto/save-draft-revision-response.dto';
import { AnalyticsService } from '../../analytics';
import type { RebaseRevisionResponseDto } from './dto/rebase-revision-response.dto';
import {
  isCreatorOrAdmin,
  isRevisionStale,
  isSelfReviewBlocked,
} from './revision.rules';
import type { ReviewRevisionDto } from './dto/review-revision.dto';
import type { ReviewRevisionResponseDto } from './dto/review-revision-response.dto';
import type { RecallRevisionResponseDto } from './dto/recall-revision-response.dto';
import { DeleteRevisionResponseDto } from './dto/delete-revision-response.dto';
import { PublishRevisionResponseDto } from './dto/publish-revision-response.dto';

const OPEN_STATUSES = [RevisionStatus.DRAFT, RevisionStatus.IN_REVIEW];

const REORDER_OFFSET = 10000;

const REVISION_SELECT = {
  id: true,
  careerId: true,
  status: true,
  baseVersion: true,
  updatedAt: true,
} as const;

const DECISION_STATUS: Record<ReviewDecision, RevisionStatus> = {
  [ReviewDecision.APPROVED]: RevisionStatus.APPROVED,
  [ReviewDecision.REJECTED]: RevisionStatus.REJECTED,
};

@Injectable()
export class RevisionsService {
  private readonly logger = new Logger(RevisionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly formatter: ReviewerDiffFormatter,
    private readonly analytics: AnalyticsService,
  ) {}

  async buildDiff(
    revisionId: string,
    actor: { id: string; role: Role },
  ): Promise<ReviewerDiffResponseDto> {
    const revision = await this.prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: {
        careerId: true,
        baseVersion: true,
        snapshot: true,
        createdAt: true,
        createdById: true,
        createdBy: { select: { profile: { select: { fullName: true } } } },
      },
    });

    const isCreator = revision.createdById === actor.id;
    const isReviewerOrAbove =
      (ROLE_RANK[actor.role] ?? -1) >= ROLE_RANK[Role.REVIEWER];
    if (!isCreator && !isReviewerOrAbove) {
      this.logger.warn(
        { revisionId, actorUserId: actor.id, reason: 'DIFF_FORBIDDEN' },
        'Revision diff denied',
      );
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'DIFF_FORBIDDEN',
        'Only the creator or a reviewer can view this diff',
      );
    }

    const liveCareer = await this.prisma.career.findUniqueOrThrow({
      where: { id: revision.careerId },
      include: {
        skills: true,
        outlook: true,
        pathway: {
          include: {
            steps: {
              include: {
                skills: { select: { skillId: true } },
                resources: { select: { resourceId: true } },
              },
            },
          },
        },
      },
    });

    const resourceIds = new Set<string>();
    for (const step of liveCareer.pathway?.steps ?? []) {
      for (const r of step.resources) resourceIds.add(r.resourceId);
    }
    const resources =
      resourceIds.size > 0
        ? await this.prisma.resource.findMany({
            where: { id: { in: [...resourceIds] } },
          })
        : [];

    const live: LiveCareerForPlan = {
      id: liveCareer.id,
      version: liveCareer.version,
      title: liveCareer.title,
      slug: liveCareer.slug,
      description: liveCareer.description,
      roleSummary: liveCareer.roleSummary,
      fieldId: liveCareer.fieldId,
      targetLevels: liveCareer.targetLevels,
      exampleActivities: liveCareer.exampleActivities,
      typicalEducationNote: liveCareer.typicalEducationNote,
      certificationsNote: liveCareer.certificationsNote,
      skills: liveCareer.skills.map((s) => ({
        skillId: s.skillId,
        importance: s.importance,
      })),
      outlook: liveCareer.outlook,
      pathway: liveCareer.pathway
        ? {
            id: liveCareer.pathway.id,
            title: liveCareer.pathway.title,
            description: liveCareer.pathway.description,
          }
        : null,
      steps: (liveCareer.pathway?.steps ?? []).map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        description: s.description,
        learningObjective: s.learningObjective,
        prerequisites: s.prerequisites,
        expectedActivity: s.expectedActivity,
        skills: s.skills.map((sk) => ({ skillId: sk.skillId })),
        resources: s.resources.map((r) => ({ resourceId: r.resourceId })),
      })),
      resources: resources.map((r) => ({
        ...r,
        certificationCost: r.certificationCost,
        lastCheckedDate: r.lastCheckedDate,
      })),
    };

    const stepLearnerCounts = await this.loadStepLearnerCounts(live.steps);

    const snapshot = revision.snapshot as unknown as CareerSnapshot;

    const plan = buildPlan({
      liveCareer: live,
      snapshot,
      baseVersion: revision.baseVersion,
      stepLearnerCounts,
    });

    this.logger.log(
      { revisionId, stale: plan.stale, actorUserId: actor.id },
      'Revision diff generated',
    );

    return this.formatter.format(revisionId, plan, snapshot, {
      title: `${liveCareer.title} (Revision)`,
      authorName: revision.createdBy.profile?.fullName ?? 'Unknown',
      createdAt: revision.createdAt,
    });
  }

  // Save Draft Revision
  async saveDraftRevision(
    revisionId: string,
    snapshot: CareerSnapshot,
    actorUserId: string,
  ): Promise<SaveDraftRevisionResponseDto> {
    const problems = findSnapshotProblems(snapshot);
    if (problems.length > 0) {
      this.logger.warn(
        { revisionId, actorUserId, reason: 'INVALID_SNAPSHOT' },
        'Draft revision rejected',
      );
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'INVALID_SNAPSHOT',
        'The snapshot is inconsistent',
        { problems },
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Peek to learn careerId (no lock), then lock career-first (same order as
      // rebase/publish/review), then lock the revision and re-read what we need.
      const peek = await tx.contentRevision.findUnique({
        where: { id: revisionId },
        select: { careerId: true },
      });
      if (!peek) return { failure: 'REVISION_NOT_FOUND' as const };

      const [career] = await tx.$queryRaw<
        { version: number; status: CareerStatus }[]
      >`SELECT "version", "status"::text AS "status" FROM "Career"
       WHERE "id" = ${peek.careerId} FOR UPDATE`;
      if (!career) return { failure: 'CAREER_NOT_FOUND' as const };

      if (career.status === CareerStatus.RETIRED)
        return { failure: 'CAREER_RETIRED' as const };

      const [revision] = await tx.$queryRaw<
        {
          status: RevisionStatus;
          baseVersion: number;
          createdById: string;
        }[]
      >`SELECT "status"::text AS "status", "baseVersion", "createdById"
       FROM "ContentRevision" WHERE "id" = ${revisionId} FOR UPDATE`;
      if (!revision) return { failure: 'REVISION_NOT_FOUND' as const };

      if (revision.status === RevisionStatus.IN_REVIEW)
        return { failure: 'REVISION_IN_REVIEW' as const };

      if (revision.status !== RevisionStatus.DRAFT)
        return { failure: 'INVALID_REVISION_STATE' as const };

      const data = structuredClone(snapshot);
      const updated = await tx.contentRevision.update({
        where: { id: revisionId },
        data: { snapshot: data },
        select: REVISION_SELECT,
      });

      return { revision: updated };
    });

    if ('failure' in result) {
      this.logger.warn(
        { revisionId, actorUserId, reason: result.failure },
        'Draft revision rejected',
      );

      if (result.failure === 'REVISION_NOT_FOUND')
        throw new NotFoundException('Revision not found');
      if (result.failure === 'CAREER_NOT_FOUND')
        throw new NotFoundException('Career not found');
      if (result.failure === 'CAREER_RETIRED')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'CAREER_RETIRED',
          'A retired career cannot take a new revision',
        );
      if (result.failure === 'REVISION_IN_REVIEW')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'REVISION_IN_REVIEW',
          'The revision is in review; recall it before saving',
          { revisionId },
        );
      throw new DomainException(
        HttpStatus.CONFLICT,
        'INVALID_REVISION_STATE',
        'Only a draft revision can be saved',
      );
    }

    const { revision } = result;
    this.logger.log({ revisionId, actorUserId }, 'Draft revision updated');

    return revision as SaveDraftRevisionResponseDto;
  }

  // Rebase Revision
  async rebaseRevision(
    revisionId: string,
    actorUserId: string,
  ): Promise<RebaseRevisionResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Phase 1: peek (no lock) to learn careerId so we can lock the career first.
      const peek = await tx.contentRevision.findUnique({
        where: { id: revisionId },
        select: { careerId: true },
      });
      if (!peek) return { failure: 'REVISION_NOT_FOUND' as const };

      // Phase 2: lock the career first — same lock order as saveDraftRevision.
      const [career] = await tx.$queryRaw<
        { version: number; status: CareerStatus }[]
      >`SELECT "version", "status"::text AS "status" FROM "Career"
       WHERE "id" = ${peek.careerId} FOR UPDATE`;
      if (!career) return { failure: 'CAREER_NOT_FOUND' as const };
      if (career.status === CareerStatus.RETIRED)
        return { failure: 'CAREER_RETIRED' as const };

      // Phase 3: lock the revision and re-read the fields we check.
      const [revision] = await tx.$queryRaw<
        {
          id: string;
          careerId: string;
          status: RevisionStatus;
          baseVersion: number;
          createdById: string;
        }[]
      >`SELECT "id", "careerId", "status"::text AS "status",
             "baseVersion", "createdById"
       FROM "ContentRevision" WHERE "id" = ${revisionId} FOR UPDATE`;
      if (!revision) return { failure: 'REVISION_NOT_FOUND' as const };

      // Business checks, in the ticket's order: creator → status.
      if (revision.createdById !== actorUserId)
        return { failure: 'NOT_REVISION_CREATOR' as const };

      if (revision.status !== RevisionStatus.DRAFT)
        return { failure: 'INVALID_REVISION_STATE' as const };

      const oldBaseVersion = revision.baseVersion;
      const liveVersion = career.version;

      // Already fresh: no write, no event.
      if (!isRevisionStale(oldBaseVersion, liveVersion)) {
        const current = await tx.contentRevision.findUniqueOrThrow({
          where: { id: revisionId },
          select: REVISION_SELECT,
        });
        return {
          revision: current,
          oldBaseVersion,
          liveVersion,
          rebased: false,
        };
      }

      // Re-anchor. Snapshot and status untouched (already DRAFT).
      const updated = await tx.contentRevision.update({
        where: { id: revisionId },
        data: { baseVersion: liveVersion },
        select: REVISION_SELECT,
      });
      return { revision: updated, oldBaseVersion, liveVersion, rebased: true };
    });

    if ('failure' in result) {
      this.logger.warn(
        { revisionId, actorUserId, reason: result.failure },
        'Rebase rejected',
      );

      if (result.failure === 'REVISION_NOT_FOUND')
        throw new NotFoundException('Revision not found');
      if (result.failure === 'CAREER_NOT_FOUND')
        throw new NotFoundException('Career not found');
      if (result.failure === 'CAREER_RETIRED')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'CAREER_RETIRED',
          'A retired career cannot take a revision',
        );
      if (result.failure === 'NOT_REVISION_CREATOR')
        throw new DomainException(
          HttpStatus.FORBIDDEN,
          'NOT_REVISION_CREATOR',
          'Only the revision creator can rebase it',
        );
      throw new DomainException(
        HttpStatus.CONFLICT,
        'INVALID_REVISION_STATE',
        'Only a draft revision can be rebased',
      );
    }

    const { revision, oldBaseVersion, liveVersion, rebased } = result;

    this.logger.log(
      { revisionId, oldBaseVersion, newBaseVersion: liveVersion, actorUserId },
      'Revision rebased',
    );

    if (rebased) {
      this.analytics.capture('revision_rebased', actorUserId, {
        revisionId,
        careerId: revision.careerId,
        newBaseVersion: liveVersion,
      });
    }

    return { ...revision, liveVersion, rebased };
  }

  // Recall Revision to DRAFT
  async recallRevision(
    revisionId: string,
    actor: { id: string; role: Role },
  ): Promise<RecallRevisionResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock career, then revision
      const peek = await tx.contentRevision.findUnique({
        where: { id: revisionId },
        select: { careerId: true },
      });
      if (!peek) return { failure: 'REVISION_NOT_FOUND' as const };

      await tx.$queryRaw`SELECT 1 FROM "Career" WHERE "id" = ${peek.careerId} FOR UPDATE`;

      const [revision] = await tx.$queryRaw<
        { status: RevisionStatus; createdById: string }[]
      >`SELECT "status"::text AS "status", "createdById"
        FROM "ContentRevision" WHERE "id" = ${revisionId} FOR UPDATE`;
      if (!revision) return { failure: 'REVISION_NOT_FOUND' as const };

      if (!isCreatorOrAdmin(revision.createdById, actor))
        return { failure: 'NOT_REVISION_CREATOR' as const };

      if (revision.status !== RevisionStatus.IN_REVIEW)
        return { failure: 'INVALID_REVISION_STATE' as const };

      const recalled = await tx.contentRevision.update({
        where: { id: revisionId },
        data: { status: RevisionStatus.DRAFT },
        select: REVISION_SELECT,
      });
      return { revision: recalled };
    });

    if ('failure' in result) {
      this.logger.warn(
        { revisionId, actorUserId: actor.id, reason: result.failure },
        'Recall rejected',
      );

      if (result.failure === 'REVISION_NOT_FOUND')
        throw new NotFoundException('Revision not found');

      if (result.failure === 'NOT_REVISION_CREATOR')
        throw new DomainException(
          HttpStatus.FORBIDDEN,
          'NOT_REVISION_CREATOR',
          'Only the revision creator or an admin can recall it',
        );

      throw new DomainException(
        HttpStatus.CONFLICT,
        'INVALID_REVISION_STATE',
        'Only a revision in review can be recalled',
      );
    }

    this.logger.log({ revisionId, actorUserId: actor.id }, 'Revision recalled');

    return result.revision;
  }

  private async loadStepLearnerCounts(
    steps: { id: string }[],
  ): Promise<Record<string, number>> {
    if (steps.length === 0) return {};

    const counts = await this.prisma.userPathwayStep.groupBy({
      by: ['pathwayStepId'],
      where: {
        pathwayStepId: { in: steps.map((s) => s.id) },
        status: 'COMPLETED',
      },
      _count: { pathwayStepId: true },
    });

    return Object.fromEntries(
      counts.map((c) => [c.pathwayStepId, c._count.pathwayStepId]),
    );
  }

  // Review Revision
  async reviewRevision(
    revisionId: string,
    reviewer: { id: string; role: Role },
    dto: ReviewRevisionDto,
  ): Promise<ReviewRevisionResponseDto> {
    const note = dto.note?.trim() || null;

    const result = await this.prisma.$transaction(async (tx) => {
      // Same lock order as save and rebase: career first, then revision.
      const peek = await tx.contentRevision.findUnique({
        where: { id: revisionId },
        select: { careerId: true },
      });
      if (!peek) return { failure: 'REVISION_NOT_FOUND' as const };

      const [career] = await tx.$queryRaw<{ version: number }[]>`
        SELECT "version" FROM "Career"
        WHERE "id" = ${peek.careerId} FOR UPDATE`;
      if (!career) return { failure: 'CAREER_NOT_FOUND' as const };

      const [revision] = await tx.$queryRaw<
        {
          status: RevisionStatus;
          baseVersion: number;
          createdById: string;
        }[]
      >`SELECT "status"::text AS "status", "baseVersion", "createdById"
        FROM "ContentRevision" WHERE "id" = ${revisionId} FOR UPDATE`;
      if (!revision) return { failure: 'REVISION_NOT_FOUND' as const };

      if (revision.status !== RevisionStatus.IN_REVIEW)
        return { failure: 'INVALID_REVISION_STATE' as const };

      if (isSelfReviewBlocked(revision.createdById, reviewer))
        return { failure: 'SELF_REVIEW_NOT_ALLOWED' as const };

      // Rejection is always allowed. Only approval needs a fresh revision.
      if (
        dto.decision === ReviewDecision.APPROVED &&
        isRevisionStale(revision.baseVersion, career.version)
      )
        return {
          failure: 'REVISION_STALE' as const,
          baseVersion: revision.baseVersion,
          liveVersion: career.version,
        };

      const review = await tx.review.create({
        data: {
          revisionId,
          reviewerId: reviewer.id,
          decision: dto.decision,
          note,
        },
        select: {
          id: true,
          revisionId: true,
          decision: true,
          note: true,
          createdAt: true,
        },
      });

      // Only the revision's status changes. Approving publishes nothing.
      const updated = await tx.contentRevision.update({
        where: { id: revisionId },
        data: { status: DECISION_STATUS[dto.decision] },
        select: { careerId: true, status: true },
      });

      return {
        review,
        careerId: updated.careerId,
        revisionStatus: updated.status,
      };
    });

    if ('failure' in result) {
      this.logger.warn(
        {
          revisionId,
          reviewerId: reviewer.id,
          decision: dto.decision,
          reason: result.failure,
        },
        'Review rejected',
      );

      if (result.failure === 'REVISION_NOT_FOUND')
        throw new NotFoundException('Revision not found');
      if (result.failure === 'CAREER_NOT_FOUND')
        throw new NotFoundException('Career not found');
      if (result.failure === 'SELF_REVIEW_NOT_ALLOWED')
        throw new DomainException(
          HttpStatus.FORBIDDEN,
          'SELF_REVIEW_NOT_ALLOWED',
          'You cannot review a revision you created',
        );
      if (result.failure === 'REVISION_STALE')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'REVISION_STALE',
          'The live career changed since this revision was created; the editor must rebase it first',
          {
            baseVersion: result.baseVersion,
            liveVersion: result.liveVersion,
          },
        );
      throw new DomainException(
        HttpStatus.CONFLICT,
        'INVALID_REVISION_STATE',
        'Only a revision in review can be reviewed',
      );
    }

    const { review, careerId, revisionStatus } = result;

    // The note is free text, so it is never logged.
    this.logger.log(
      { revisionId, decision: review.decision, reviewerId: reviewer.id },
      'Revision reviewed',
    );

    this.analytics.capture('revision_reviewed', reviewer.id, {
      revisionId,
      careerId,
      decision: review.decision,
    });

    return {
      id: review.id,
      revisionId: review.revisionId,
      decision: review.decision,
      note: review.note,
      revisionStatus,
      createdAt: review.createdAt,
    };
  }

  // Publish Revision
  async publishRevision(
    revisionId: string,
    actor: { id: string; role: Role },
  ): Promise<PublishRevisionResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      // ── Lock: career first, then revision (same order as save/rebase/review)
      const peek = await tx.contentRevision.findUnique({
        where: { id: revisionId },
        select: { careerId: true },
      });
      if (!peek) return { failure: 'REVISION_NOT_FOUND' as const };

      const [career] = await tx.$queryRaw<
        { version: number; status: CareerStatus }[]
      >`SELECT "version", "status"::text AS "status" FROM "Career"
       WHERE "id" = ${peek.careerId} FOR UPDATE`;
      if (!career) return { failure: 'CAREER_NOT_FOUND' as const };

      const [revision] = await tx.$queryRaw<
        {
          status: RevisionStatus;
          baseVersion: number;
          snapshot: unknown;
        }[]
      >`SELECT "status"::text AS "status", "baseVersion", "snapshot"
       FROM "ContentRevision" WHERE "id" = ${revisionId} FOR UPDATE`;
      if (!revision) return { failure: 'REVISION_NOT_FOUND' as const };

      // ── Gate: state + retired-career rule
      if (revision.status !== RevisionStatus.APPROVED)
        return { failure: 'INVALID_REVISION_STATE' as const };

      if (career.status === CareerStatus.RETIRED && actor.role !== Role.ADMIN)
        return { failure: 'CAREER_RETIRED' as const };

      // ── Load live in plan shape, counts, approving review
      const live = await this.loadLiveCareerForPlan(tx, peek.careerId);
      if (!live) return { failure: 'CAREER_NOT_FOUND' as const };

      const stepLearnerCounts = await this.loadStepLearnerCountsTx(
        tx,
        live.steps.map((s) => s.id),
      );

      const plan = buildPlan({
        liveCareer: live,
        snapshot: revision.snapshot as CareerSnapshot,
        baseVersion: revision.baseVersion,
        stepLearnerCounts,
      });

      // ── Pre-checks from the plan
      if (plan.stale)
        return {
          failure: 'REVISION_STALE' as const,
          baseVersion: plan.baseVersion,
          liveVersion: plan.liveVersion,
        };

      const progressBlocker = plan.blockers.find(
        (b) => b.code === 'STEP_HAS_PROGRESS',
      );
      if (progressBlocker)
        return {
          failure: 'STEP_HAS_PROGRESS' as const,
          stepId: progressBlocker.entityId,
          stepTitle: progressBlocker.entityTitle,
          learnersAffected: progressBlocker.learnersAffected,
        };

      const otherBlocker = plan.blockers[0];
      if (otherBlocker)
        return {
          failure: 'PLAN_BLOCKED' as const,
          code: otherBlocker.code,
          message: otherBlocker.message,
        };

      // ── Approving review (source of reviewedById/At)
      const approvingReview = await tx.review.findFirst({
        where: { revisionId, decision: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        select: { reviewerId: true, createdAt: true },
      });
      if (!approvingReview) return { failure: 'NO_APPROVING_REVIEW' as const };

      // ── Apply
      await this.applyPlan(tx, plan, live, peek.careerId);

      const newVersion = career.version + 1;
      const publishedAt = new Date();

      await tx.career.update({
        where: { id: peek.careerId },
        data: {
          version: newVersion,
          status: CareerStatus.PUBLISHED,
          publishedById: actor.id,
          publishedAt,
          reviewedById: approvingReview.reviewerId,
          reviewedAt: approvingReview.createdAt,
        },
      });

      await tx.contentRevision.update({
        where: { id: revisionId },
        data: { status: RevisionStatus.PUBLISHED },
      });

      return { careerId: peek.careerId, newVersion, publishedAt };
    });

    if ('failure' in result) {
      this.logger.warn(
        {
          revisionId,
          actorUserId: actor.id,
          reason: result.failure,
          ...(result.failure === 'STEP_HAS_PROGRESS' && {
            learnersAffected: result.learnersAffected,
          }),
        },
        'Publish rejected',
      );

      if (result.failure === 'REVISION_NOT_FOUND')
        throw new NotFoundException('Revision not found');
      if (result.failure === 'CAREER_NOT_FOUND')
        throw new NotFoundException('Career not found');
      if (result.failure === 'CAREER_RETIRED')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'CAREER_RETIRED',
          'Only an ADMIN can publish a revision on a retired career',
        );
      if (result.failure === 'REVISION_STALE')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'REVISION_STALE',
          'The live career changed since this revision was created; rebase first',
          { baseVersion: result.baseVersion, liveVersion: result.liveVersion },
        );
      if (result.failure === 'STEP_HAS_PROGRESS')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'STEP_HAS_PROGRESS',
          'A removed step has learner progress',
          {
            stepId: result.stepId,
            stepTitle: result.stepTitle,
            learnersAffected: result.learnersAffected,
          },
        );
      if (result.failure === 'PLAN_BLOCKED')
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          result.code,
          result.message,
        );
      if (result.failure === 'NO_APPROVING_REVIEW')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'NO_APPROVING_REVIEW',
          'Revision is marked APPROVED but has no approving review',
        );
      throw new DomainException(
        HttpStatus.CONFLICT,
        'INVALID_REVISION_STATE',
        'Only an APPROVED revision can be published',
      );
    }

    const { careerId, newVersion, publishedAt } = result;

    this.logger.log(
      { revisionId, careerId, newVersion, actorUserId: actor.id },
      'Revision published',
    );

    this.analytics.capture('revision_published', actor.id, {
      revisionId,
      careerId,
      newVersion,
    });

    return {
      revisionId,
      careerId,
      revisionStatus: RevisionStatus.PUBLISHED,
      careerStatus: CareerStatus.PUBLISHED,
      newVersion,
      publishedAt,
    };
  }

  private async loadLiveCareerForPlan(
    tx: Prisma.TransactionClient,
    careerId: string,
  ): Promise<LiveCareerForPlan | null> {
    const career = await tx.career.findUnique({
      where: { id: careerId },
      include: {
        skills: true,
        outlook: true,
        pathway: {
          include: {
            steps: {
              include: {
                skills: { select: { skillId: true } },
                resources: { select: { resourceId: true } },
              },
            },
          },
        },
      },
    });
    if (!career) return null;

    const resourceIds = new Set<string>();
    for (const step of career.pathway?.steps ?? [])
      for (const r of step.resources) resourceIds.add(r.resourceId);

    const resources =
      resourceIds.size > 0
        ? await tx.resource.findMany({
            where: { id: { in: [...resourceIds] } },
          })
        : [];

    return {
      id: career.id,
      version: career.version,
      title: career.title,
      slug: career.slug,
      description: career.description,
      roleSummary: career.roleSummary,
      fieldId: career.fieldId,
      targetLevels: career.targetLevels,
      exampleActivities: career.exampleActivities,
      typicalEducationNote: career.typicalEducationNote,
      certificationsNote: career.certificationsNote,
      skills: career.skills.map((s) => ({
        skillId: s.skillId,
        importance: s.importance,
      })),
      outlook: career.outlook,
      pathway: career.pathway
        ? {
            id: career.pathway.id,
            title: career.pathway.title,
            description: career.pathway.description,
          }
        : null,
      steps: (career.pathway?.steps ?? []).map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        description: s.description,
        learningObjective: s.learningObjective,
        prerequisites: s.prerequisites,
        expectedActivity: s.expectedActivity,
        skills: s.skills.map((sk) => ({ skillId: sk.skillId })),
        resources: s.resources.map((r) => ({ resourceId: r.resourceId })),
      })),
      resources: resources.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        url: r.url,
        type: r.type,
        provider: r.provider,
        costStatus: r.costStatus,
        certificationCost: r.certificationCost,
        curationRationale: r.curationRationale,
        lastCheckedDate: r.lastCheckedDate,
      })),
    };
  }

  private async loadStepLearnerCountsTx(
    tx: Prisma.TransactionClient,
    stepIds: string[],
  ): Promise<Record<string, number>> {
    if (stepIds.length === 0) return {};
    const counts = await tx.userPathwayStep.groupBy({
      by: ['pathwayStepId'],
      where: { pathwayStepId: { in: stepIds }, status: 'COMPLETED' },
      _count: { pathwayStepId: true },
    });
    return Object.fromEntries(
      counts.map((c) => [c.pathwayStepId, c._count.pathwayStepId]),
    );
  }

  private async applyPlan(
    tx: Prisma.TransactionClient,
    plan: CareerPlan,
    live: LiveCareerForPlan,
    careerId: string,
  ): Promise<void> {
    const by = (section: string, ...kinds: string[]) =>
      plan.operations.filter(
        (o) => o.section === section && kinds.includes(o.kind),
      );

    // ── 1. Resource creates FIRST (temp-id step links may reference them)
    const createdResourceIds = new Map<string, string>();
    for (const op of by('resources', 'create')) {
      const snap = op.after as LiveResource & { id: string };
      const created = await tx.resource.create({
        data: {
          title: snap.title,
          description: snap.description,
          url: snap.url,
          type: snap.type as never,
          provider: snap.provider,
          costStatus: snap.costStatus as never,
          certificationCost: snap.certificationCost as never,
          curationRationale: snap.curationRationale,
          lastCheckedDate: snap.lastCheckedDate,
        },
        select: { id: true },
      });
      createdResourceIds.set(op.entityId ?? snap.id, created.id);
    }

    const resolveResourceId = (id: string | undefined): string | undefined =>
      id && createdResourceIds.get(id) ? createdResourceIds.get(id) : id;

    // ── 2. Resource updates (existing rows, whole after payload)
    for (const op of by('resources', 'update')) {
      const snap = op.after as LiveResource;
      await tx.resource.update({
        where: { id: op.entityId! },
        data: {
          title: snap.title,
          description: snap.description,
          url: snap.url,
          type: snap.type as never,
          provider: snap.provider,
          costStatus: snap.costStatus as never,
          certificationCost: snap.certificationCost as never,
          curationRationale: snap.curationRationale,
          lastCheckedDate: snap.lastCheckedDate,
        },
      });
    }

    // ── 3. Career field updates (grouped by field — one update)
    const careerUpdates = by('career', 'update');
    if (careerUpdates.length > 0) {
      const data: Record<string, unknown> = {};
      for (const op of careerUpdates) data[op.field!] = op.after;
      await tx.career.update({ where: { id: careerId }, data });
    }

    // ── 4. Pathway create / update / delete
    for (const op of by('pathway', 'create')) {
      await tx.pathway.create({
        data: {
          careerId,
          title: (op.after as { title: string }).title,
          description: (op.after as { description: string | null }).description,
        },
      });
    }
    const pathwayUpdates = by('pathway', 'update');
    if (pathwayUpdates.length > 0 && live.pathway) {
      const data: Record<string, unknown> = {};
      for (const op of pathwayUpdates) data[op.field!] = op.after;
      await tx.pathway.update({ where: { id: live.pathway.id }, data });
    }

    // ── 5. Steps: two-pass reorder → updates → creates → deletes
    const stepMoves = by('steps', 'move');
    if (stepMoves.length > 0) {
      const ids = stepMoves.map((o) => o.entityId!) as string[];
      await tx.pathwayStep.updateMany({
        where: { id: { in: ids } },
        data: { order: { increment: REORDER_OFFSET } },
      });
      for (const m of stepMoves) {
        await tx.pathwayStep.update({
          where: { id: m.entityId! },
          data: { order: m.after as number },
        });
      }
    }

    const stepUpdateGroups = new Map<string, Record<string, unknown>>();
    for (const op of by('steps', 'update')) {
      const id = op.entityId!;
      const cur = stepUpdateGroups.get(id) ?? {};
      cur[op.field!] = op.after;
      stepUpdateGroups.set(id, cur);
    }
    for (const [id, data] of stepUpdateGroups) {
      await tx.pathwayStep.update({ where: { id }, data });
    }

    const tempStepMap = new Map<string, string>();
    const stepCreates = by('steps', 'create');
    if (stepCreates.length > 0) {
      const pathway = await tx.pathway.findUnique({
        where: { careerId },
        select: { id: true },
      });
      if (!pathway) {
        throw new DomainException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'PATHWAY_MISSING',
          'Pathway is required to create steps',
        );
      }
      for (const op of stepCreates) {
        const snap = op.after as {
          title: string;
          description: string | null;
          learningObjective: string;
          prerequisites: string | null;
          expectedActivity: string;
          order: number;
        };
        const created = await tx.pathwayStep.create({
          data: {
            pathwayId: pathway.id,
            title: snap.title,
            description: snap.description,
            learningObjective: snap.learningObjective,
            prerequisites: snap.prerequisites,
            expectedActivity: snap.expectedActivity,
            order: snap.order,
          },
          select: { id: true },
        });
        if (op.entityId) tempStepMap.set(op.entityId, created.id);
      }
    }

    for (const op of by('steps', 'delete')) {
      await tx.pathwayStep.delete({ where: { id: op.entityId! } });
    }

    // ── 6. Step skills / step resources
    const resolveStepId = (id: string | undefined): string | undefined =>
      id && tempStepMap.get(id) ? tempStepMap.get(id) : id;

    for (const op of by('stepSkills', 'link')) {
      const stepId = resolveStepId(op.parentId);
      if (!stepId) continue;
      await tx.pathwayStepSkill.create({
        data: { pathwayStepId: stepId, skillId: op.entityId! },
      });
    }
    for (const op of by('stepSkills', 'unlink')) {
      const stepId = resolveStepId(op.parentId);
      if (!stepId) continue;
      await tx.pathwayStepSkill.delete({
        where: {
          pathwayStepId_skillId: {
            pathwayStepId: stepId,
            skillId: op.entityId!,
          },
        },
      });
    }
    for (const op of by('stepResources', 'link')) {
      const stepId = resolveStepId(op.parentId);
      const resourceId = resolveResourceId(op.entityId);
      if (!stepId || !resourceId) continue;
      await tx.pathwayStepResource.create({
        data: { pathwayStepId: stepId, resourceId },
      });
    }
    for (const op of by('stepResources', 'unlink')) {
      const stepId = resolveStepId(op.parentId);
      const resourceId = resolveResourceId(op.entityId);
      if (!stepId || !resourceId) continue;
      await tx.pathwayStepResource.delete({
        where: {
          pathwayStepId_resourceId: {
            pathwayStepId: stepId,
            resourceId,
          },
        },
      });
    }

    // ── 7. Resource deletes — AFTER step-resource unlinks, so the count is accurate
    for (const op of by('resources', 'unlink')) {
      const stillReferenced = await tx.pathwayStepResource.count({
        where: { resourceId: op.entityId! },
      });
      if (stillReferenced === 0) {
        await tx.resource.delete({ where: { id: op.entityId! } });
      }
    }

    // ── 8. Pathway delete — after its steps were removed
    for (const op of by('pathway', 'delete')) {
      await tx.pathway.delete({ where: { id: op.entityId! } });
    }

    // ── 9. Career skills (link / update importance / unlink)
    for (const op of by('skills', 'link')) {
      const after = op.after as { skillId: string; importance: string };
      await tx.careerSkill.create({
        data: {
          careerId,
          skillId: after.skillId,
          importance: after.importance as never,
        },
      });
    }
    for (const op of by('skills', 'update')) {
      await tx.careerSkill.update({
        where: {
          careerId_skillId: { careerId, skillId: op.entityId! },
        },
        data: { importance: op.after as never },
      });
    }
    for (const op of by('skills', 'unlink')) {
      await tx.careerSkill.delete({
        where: {
          careerId_skillId: { careerId, skillId: op.entityId! },
        },
      });
    }

    // ── 10. Outlook: create / update / delete, by id
    for (const op of by('outlook', 'create')) {
      const after = op.after as Record<string, unknown>;
      await tx.outlookData.create({ data: { careerId, ...after } as never });
    }
    for (const op of by('outlook', 'update')) {
      const after = op.after as Record<string, unknown>;
      await tx.outlookData.update({
        where: { id: op.entityId! },
        data: after as never,
      });
    }
    for (const op of by('outlook', 'delete')) {
      await tx.outlookData.delete({ where: { id: op.entityId! } });
    }
  }

  // Delete Draft Revision
  async deleteDraftRevision(
    revisionId: string,
    actorUserId: string,
  ): Promise<DeleteRevisionResponseDto> {
    const { count } = await this.prisma.contentRevision.deleteMany({
      where: { id: revisionId, status: RevisionStatus.DRAFT },
    });

    if (count === 0) {
      const revision = await this.prisma.contentRevision.findUnique({
        where: { id: revisionId },
        select: { status: true },
      });
      this.logger.warn(
        {
          revisionId,
          actorUserId,
          reason: revision ? 'INVALID_REVISION_STATE' : 'REVISION_NOT_FOUND',
        },
        'Draft revision delete rejected',
      );
      if (!revision) throw new NotFoundException('Revision not found');
      throw new DomainException(
        HttpStatus.CONFLICT,
        'INVALID_REVISION_STATE',
        'Only a draft revision can be deleted',
        { status: revision.status },
      );
    }

    this.logger.log({ revisionId, actorUserId }, 'Draft revision deleted');
    return { message: 'Draft revision deleted' };
  }
}
