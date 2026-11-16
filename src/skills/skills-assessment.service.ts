import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../prisma';
import { CareerStatus, UserSkillStatus } from '../generated/prisma/client';
import {
  AssessmentResponseDto,
  AssessmentSkillDto,
  AssessmentStageDto,
} from './dto/assessment-response.dto';
import {
  SaveAssessmentDto,
  SaveAssessmentResponseDto,
} from './dto/save-assessment.dto';
import { normalizeUserSkillStatus } from './user-skill-status.rules';
import {
  buildInitialAssessmentProgress,
  UserSkillProgressRow,
} from './user-skill-progress.rules';
import { computeHeadstart, HeadstartStep } from './headstart.rules';

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

      const steps = await tx.pathwayStep.findMany({
        where: { pathwayId },
        select: {
          id: true,
          order: true,
          skills: { select: { skillId: true } },
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

      this.logger.log(
        { userId, updated: dto.skills.length },
        'Assessment saved',
      );

      return {
        updated: dto.skills.length,
        allGapsClosed: headstart.allGapsClosed,
        startStepId: headstart.startStepId,
      };
    });
  }
}
