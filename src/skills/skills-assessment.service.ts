import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { CareerStatus, UserSkillStatus } from '../generated/prisma/client';
import {
  AssessmentResponseDto,
  AssessmentSkillDto,
  AssessmentStageDto,
} from './dto/assessment-response.dto';
import {
  AssessmentStatsDto,
  SaveAssessmentDto,
  SaveAssessmentResponseDto,
  SkillGapDto,
} from './dto/save-assessment.dto';
import { DomainException } from '../common/exceptions/domain.exception';
import { normalizeUserSkillStatus } from './user-skill-status.rules';
import {
  buildInitialAssessmentProgress,
  UserSkillProgressRow,
} from './user-skill-progress.rules';
import { computeHeadstart, HeadstartStep } from './headstart.rules';

interface StepWithSkillNames {
  id: string;
  title: string;
  description: string | null;
  order: number;
  skills: Array<{ skillId: string; skill: { name: string } }>;
}

@Injectable()
export class SkillsAssessmentService {
  private readonly logger = new Logger(SkillsAssessmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAssessment(userId: string): Promise<AssessmentResponseDto> {
    const userPathway = await this.prisma.userPathway.findFirst({
      where: {
        userId,
        isActive: true,
        career: {
          status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
        },
      },
      select: {
        careerId: true,
        career: {
          select: {
            pathway: {
              select: {
                id: true,
                stages: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    order: true,
                    steps: {
                      orderBy: { order: 'asc' },
                      select: {
                        id: true,
                        skills: {
                          select: {
                            skill: { select: { id: true, name: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!userPathway || !userPathway.career.pathway) {
      throw new NotFoundException('NO_ACTIVE_PATHWAY');
    }

    const { careerId, career } = userPathway;
    const pathway = career.pathway!;

    const allSkillIds = new Set<string>();
    for (const stage of pathway.stages) {
      for (const step of stage.steps) {
        for (const { skill } of step.skills) {
          allSkillIds.add(skill.id);
        }
      }
    }

    const savedSkills =
      allSkillIds.size === 0
        ? []
        : await this.prisma.userSkill.findMany({
            where: { userId, skillId: { in: [...allSkillIds] } },
            select: { skillId: true, status: true, rating: true },
          });

    const savedBySkillId = new Map<
      string,
      { status: UserSkillStatus; rating: number | null }
    >(
      savedSkills.map((s) => [
        s.skillId,
        { status: s.status, rating: s.rating },
      ]),
    );

    const seenSkillIds = new Set<string>();
    const stages: AssessmentStageDto[] = pathway.stages.map((stage) => {
      const skills: AssessmentSkillDto[] = [];

      for (const step of stage.steps) {
        for (const { skill } of step.skills) {
          if (seenSkillIds.has(skill.id)) continue;
          seenSkillIds.add(skill.id);

          const saved = savedBySkillId.get(skill.id);
          skills.push({
            skillId: skill.id,
            skillName: skill.name,
            status: saved?.status ?? UserSkillStatus.NOT_SURE,
            rating: saved?.rating ?? null,
          });
        }
      }

      return {
        stageId: stage.id,
        stageTitle: stage.title,
        stageOrder: stage.order,
        skills,
      };
    });

    return {
      careerId,
      pathwayId: pathway.id,
      stages,
    };
  }

  async saveAssessment(
    userId: string,
    dto: SaveAssessmentDto,
  ): Promise<SaveAssessmentResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const userPathway = await tx.userPathway.findFirst({
        where: {
          userId,
          isActive: true,
          career: {
            status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
          },
        },
        select: {
          careerId: true,
          startStepId: true,
          career: { select: { pathway: { select: { id: true } } } },
        },
      });

      if (!userPathway || !userPathway.career.pathway) {
        throw new NotFoundException('NO_ACTIVE_PATHWAY');
      }

      const { careerId, startStepId: currentStartStepId } = userPathway;
      const pathwayId = userPathway.career.pathway.id;

      const steps: StepWithSkillNames[] = await tx.pathwayStep.findMany({
        where: { pathwayId },
        select: {
          id: true,
          title: true,
          description: true,
          order: true,
          skills: {
            select: {
              skillId: true,
              skill: { select: { name: true } },
            },
          },
        },
      });

      const headstartSteps: HeadstartStep[] = steps.map((s) => ({
        id: s.id,
        order: s.order,
        skillIds: s.skills.map((sk) => sk.skillId),
      }));

      const validSkillIds = new Set<string>();
      for (const step of steps) {
        for (const { skillId } of step.skills) validSkillIds.add(skillId);
      }

      const unknownSkillIds = dto.skills
        .map((s) => s.skillId)
        .filter((id) => !validSkillIds.has(id));

      if (unknownSkillIds.length > 0) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'UNKNOWN_SKILL_IN_PATHWAY',
          'One or more skills do not belong to the active pathway',
          { skillIds: unknownSkillIds },
        );
      }

      const invalidRatings = dto.skills.filter(
        (s) => s.status !== UserSkillStatus.HAVE && s.rating !== undefined,
      );

      if (invalidRatings.length > 0) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'RATING_REQUIRES_HAVE',
          'A rating is only allowed when status is HAVE',
          { skillIds: invalidRatings.map((s) => s.skillId) },
        );
      }

      const dtoSkillIds = dto.skills.map((s) => s.skillId);
      const existingRows = await tx.userSkill.findMany({
        where: { userId, skillId: { in: dtoSkillIds } },
        select: { id: true, skillId: true, status: true, rating: true },
      });
      const existingBySkillId = new Map(
        existingRows.map((r) => [r.skillId, r]),
      );

      const progressRows: UserSkillProgressRow[] = [];

      for (const entry of dto.skills) {
        const normalized = normalizeUserSkillStatus({
          status: entry.status,
          rating: entry.rating ?? null,
        });

        const existing = existingBySkillId.get(entry.skillId) ?? null;

        const saved = await tx.userSkill.upsert({
          where: { userId_skillId: { userId, skillId: entry.skillId } },
          create: {
            userId,
            skillId: entry.skillId,
            status: normalized.status,
            rating: normalized.rating,
          },
          update: {
            status: normalized.status,
            rating: normalized.rating,
          },
          select: { id: true },
        });

        const progressRow = buildInitialAssessmentProgress({
          userSkillId: saved.id,
          previous: existing
            ? { status: existing.status, rating: existing.rating }
            : null,
          next: normalized,
        });

        if (progressRow) progressRows.push(progressRow);
      }

      if (progressRows.length > 0) {
        await tx.userSkillProgress.createMany({ data: progressRows });
      }

      const allSkillStates =
        validSkillIds.size === 0
          ? []
          : await tx.userSkill.findMany({
              where: { userId, skillId: { in: [...validSkillIds] } },
              select: { skillId: true, status: true },
            });

      const headstart = computeHeadstart(headstartSteps, allSkillStates);

      if (headstart.startStepId !== currentStartStepId) {
        await tx.userPathway.update({
          where: { userId_careerId: { userId, careerId } },
          data: { startStepId: headstart.startStepId },
        });
        this.logger.log(
          { userId, startStepId: headstart.startStepId },
          'Starting point changed',
        );
      }

      // ─── Build results payload ───
      const skillNameBySkillId = new Map<string, string>();
      const stepBySkillId = new Map<
        string,
        { id: string; title: string; order: number }
      >();

      for (const step of steps) {
        for (const { skillId, skill } of step.skills) {
          if (!skillNameBySkillId.has(skillId)) {
            skillNameBySkillId.set(skillId, skill.name);
          }
          if (!stepBySkillId.has(skillId)) {
            stepBySkillId.set(skillId, {
              id: step.id,
              title: step.title,
              order: step.order,
            });
          }
        }
      }

      let have = 0;
      let dontHave = 0;
      let notSure = 0;
      const gaps: SkillGapDto[] = [];

      for (const state of allSkillStates) {
        if (state.status === UserSkillStatus.HAVE) {
          have++;
        } else if (state.status === UserSkillStatus.NOT_SURE) {
          notSure++;
        } else if (state.status === UserSkillStatus.DONT_HAVE) {
          dontHave++;
          const step = stepBySkillId.get(state.skillId);
          const skillName = skillNameBySkillId.get(state.skillId);
          if (step && skillName) {
            gaps.push({
              skillId: state.skillId,
              skillName,
              stepId: step.id,
              stepTitle: step.title,
              stepOrder: step.order,
            });
          }
        }
      }

      gaps.sort((a, b) => a.stepOrder - b.stepOrder);

      const stats: AssessmentStatsDto = { have, dontHave, notSure };

      let startStepTitle: string | null = null;
      let startStepDescription: string | null = null;
      if (headstart.startStepId) {
        const target = steps.find((s) => s.id === headstart.startStepId);
        if (target) {
          startStepTitle = target.title;
          startStepDescription = target.description;
        }
      }

      this.logger.log(
        { userId, updated: dto.skills.length },
        'Assessment saved',
      );

      return {
        updated: dto.skills.length,
        allGapsClosed: headstart.allGapsClosed,
        startStepId: headstart.startStepId,
        startStepTitle,
        startStepDescription,
        stats,
        gaps,
      };
    });
  }

  async resetAssessment(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const userPathway = await tx.userPathway.findFirst({
        where: {
          userId,
          isActive: true,
          career: {
            status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
          },
        },
        select: {
          careerId: true,
          career: { select: { pathway: { select: { id: true } } } },
        },
      });

      if (!userPathway || !userPathway.career.pathway) {
        throw new NotFoundException('NO_ACTIVE_PATHWAY');
      }

      const { careerId } = userPathway;
      const pathwayId = userPathway.career.pathway.id;

      const pathwaySkills = await tx.pathwayStepSkill.findMany({
        where: { pathwayStep: { pathwayId } },
        select: { skillId: true },
        distinct: ['skillId'],
      });
      const skillIds = pathwaySkills.map((s) => s.skillId);

      if (skillIds.length === 0) {
        // Nothing to reset; still clear startStepId to be safe.
        await tx.userPathway.update({
          where: { userId_careerId: { userId, careerId } },
          data: { startStepId: null },
        });
        return;
      }

      const userSkills = await tx.userSkill.findMany({
        where: { userId, skillId: { in: skillIds } },
        select: { id: true },
      });
      const userSkillIds = userSkills.map((u) => u.id);

      if (userSkillIds.length > 0) {
        await tx.userSkillProgress.deleteMany({
          where: { userSkillId: { in: userSkillIds } },
        });
        await tx.userSkill.deleteMany({
          where: { id: { in: userSkillIds } },
        });
      }

      await tx.userPathway.update({
        where: { userId_careerId: { userId, careerId } },
        data: { startStepId: null },
      });

      this.logger.log(
        { userId, deletedSkills: userSkillIds.length },
        'Assessment reset',
      );
    });
  }
}
