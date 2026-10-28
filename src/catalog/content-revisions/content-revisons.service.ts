import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  buildPlan,
  type CareerPlan,
  type LiveCareerForPlan,
} from './career-snapshot.plan';
import type { CareerSnapshot } from './career-snapshot.types';

@Injectable()
export class RevisionsService {
  private readonly logger = new Logger(RevisionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildDiff(revisionId: string, reviewerId: string): Promise<CareerPlan> {
    const revision = await this.prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { careerId: true, baseVersion: true, snapshot: true },
    });

    const liveCareer = await this.prisma.career.findUniqueOrThrow({
      where: { id: revision.careerId },
      include: {
        skills: true,
        outlook: true,
        pathway: {
          include: { steps: { include: { skills: true, resources: true } } },
        },
      },
    });

    // Career-level "resources": distinct resources referenced by any step
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

    const plan = buildPlan({
      liveCareer: live,
      snapshot: revision.snapshot as unknown as CareerSnapshot,
      baseVersion: revision.baseVersion,
      stepLearnerCounts,
    });

    this.logger.log(
      { revisionId, stale: plan.stale, reviewerId },
      'Revision diff generated',
    );

    return plan;
  }

  private async loadStepLearnerCounts(
    steps: { id: string }[],
  ): Promise<Record<string, number>> {
    if (steps.length === 0) return {};

    const counts = await this.prisma.userPathwayStep.groupBy({
      by: ['pathwayStepId'],
      where: {
        pathwayStepId: { in: steps.map((s) => s.id) },
        status: 'COMPLETED', // "active" = learners who completed
      },
      _count: { pathwayStepId: true },
    });

    return Object.fromEntries(
      counts.map((c) => [c.pathwayStepId, c._count.pathwayStepId]),
    );
  }
}
