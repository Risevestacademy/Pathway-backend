import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { DomainException } from '../../common';
import { CareerStatus, RevisionStatus } from '../../generated/prisma/client';
import { buildPlan, type LiveCareerForPlan } from './career-snapshot.plan';
import { findSnapshotProblems } from './career-snapshot.consistency';
import type { CareerSnapshot } from './career-snapshot.types';
import { ReviewerDiffFormatter } from './reviewer-diff.formatter';
import type { ReviewerDiffResponseDto } from './dto/reviewer-diff-response.dto';
import type { SaveDraftRevisionResponseDto } from './dto/save-draft-revision-response.dto';
import { AnalyticsService } from '../../analytics';
import type { RebaseRevisionResponseDto } from './dto/rebase-revision-response.dto';

const OPEN_STATUSES = [RevisionStatus.DRAFT, RevisionStatus.IN_REVIEW];

const REVISION_SELECT = {
  id: true,
  careerId: true,
  status: true,
  baseVersion: true,
  updatedAt: true,
} as const;

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
    reviewerId: string,
  ): Promise<ReviewerDiffResponseDto> {
    const revision = await this.prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: {
        careerId: true,
        baseVersion: true,
        snapshot: true,
        createdAt: true,
        createdBy: { select: { profile: { select: { fullName: true } } } },
      },
    });

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
      { revisionId, stale: plan.stale, reviewerId },
      'Revision diff generated',
    );

    return this.formatter.format(revisionId, plan, snapshot, {
      title: `${liveCareer.title} (Revision)`,
      authorName: revision.createdBy.profile?.fullName ?? 'Unknown',
      createdAt: revision.createdAt,
    });
  }

  async saveDraftRevision(
    careerId: string,
    snapshot: CareerSnapshot,
    actorUserId: string,
  ): Promise<SaveDraftRevisionResponseDto> {
    const problems = findSnapshotProblems(snapshot);
    if (problems.length > 0) {
      this.logger.warn(
        { careerId, actorUserId, reason: 'INVALID_SNAPSHOT' },
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
      const [career] = await tx.$queryRaw<
        { version: number; status: CareerStatus }[]
      >`SELECT "version", "status"::text AS "status" FROM "Career" WHERE "id" = ${careerId} FOR UPDATE`;
      if (!career) return { failure: 'CAREER_NOT_FOUND' as const };

      if (career.status === CareerStatus.RETIRED)
        return { failure: 'CAREER_RETIRED' as const };

      const open = await tx.contentRevision.findFirst({
        where: { careerId, status: { in: OPEN_STATUSES } },
        select: { id: true, status: true },
      });

      if (open?.status === RevisionStatus.IN_REVIEW)
        return { failure: 'REVISION_IN_REVIEW' as const, revisionId: open.id };

      const data = structuredClone(snapshot);
      if (open) {
        const revision = await tx.contentRevision.update({
          where: { id: open.id },
          data: { snapshot: data },
          select: REVISION_SELECT,
        });
        return { revision, created: false };
      }

      const revision = await tx.contentRevision.create({
        data: {
          careerId,
          baseVersion: career.version,
          snapshot: data,
          createdById: actorUserId,
        },
        select: REVISION_SELECT,
      });
      return { revision, created: true };
    });

    if ('failure' in result) {
      this.logger.warn(
        { careerId, actorUserId, reason: result.failure },
        'Draft revision rejected',
      );

      if (result.failure === 'CAREER_NOT_FOUND')
        throw new NotFoundException('Career not found');

      if (result.failure === 'CAREER_RETIRED')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'CAREER_RETIRED',
          'A retired career cannot take a new revision',
        );

      throw new DomainException(
        HttpStatus.CONFLICT,
        'REVISION_IN_REVIEW',
        'The open revision is in review; recall it before saving',
        { revisionId: result.revisionId },
      );
    }

    const { revision, created } = result;
    this.logger.log(
      { revisionId: revision.id, careerId, actorUserId, created },
      created ? 'Draft revision created' : 'Draft revision updated',
    );

    return { ...revision, created };
  }

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
      if (oldBaseVersion === liveVersion) {
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
}
