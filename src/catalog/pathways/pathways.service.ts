import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CareerStatus, PathwayStepStatus } from '../../generated/prisma/client';
import { PathwayMetadataDto } from './dto/pathway-metadata.dto';
import { ActivePathwayResponseDto } from './dto/active-pathway-response.dto';
import { computeProgress, computeStepStatuses } from './progress';

@Injectable()
export class PathwaysService {
  constructor(private readonly prisma: PrismaService) {}

  async getPathwayMetadata(pathwayId: string): Promise<PathwayMetadataDto> {
    const pathway = await this.prisma.pathway.findFirst({
      where: {
        id: pathwayId,
        career: { status: CareerStatus.PUBLISHED },
      },
      select: {
        id: true,
        careerId: true,
        title: true,
        description: true,
        _count: { select: { steps: true } },
        steps: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            order: true,
            description: true,
          },
        },
      },
    });

    if (!pathway) {
      throw new NotFoundException('Pathway not found');
    }

    return {
      id: pathway.id,
      careerId: pathway.careerId,
      title: pathway.title,
      description: pathway.description,
      stepCount: pathway._count.steps,
      steps: pathway.steps,
    };
  }

  async setActivePathway(
    userId: string,
    careerId: string,
  ): Promise<ActivePathwayResponseDto> {
    const career = await this.prisma.career.findFirst({
      where: { id: careerId, status: CareerStatus.PUBLISHED },
      select: { id: true },
    });

    if (!career) {
      throw new NotFoundException('Career not found');
    }

    const pathway = await this.prisma.pathway.findUnique({
      where: { careerId },
      select: { id: true },
    });

    if (!pathway) {
      throw new ConflictException('This career has no pathway yet');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPathway.updateMany({
        where: { userId, isActive: true, careerId: { not: careerId } },
        data: { isActive: false },
      });

      await tx.userPathway.upsert({
        where: { userId_careerId: { userId, careerId } },
        create: { userId, careerId, isActive: true },
        update: { isActive: true },
      });
    });

    return this.getActivePathway(userId);
  }

  async getActivePathway(userId: string): Promise<ActivePathwayResponseDto> {
    const activeUserPathway = await this.prisma.userPathway.findFirst({
      where: { userId, isActive: true },
      select: {
        career: {
          select: {
            id: true,
            slug: true,
            title: true,
            roleSummary: true,
            status: true,
            pathway: {
              select: {
                id: true,
                title: true,
                steps: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    order: true,
                    title: true,
                    skills: {
                      select: { skill: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!activeUserPathway) {
      return { career: null, pathway: null, progress: null, steps: [] };
    }

    const { career } = activeUserPathway;

    if (!career.pathway) {
      return { career: null, pathway: null, progress: null, steps: [] };
    }

    const { pathway } = career;

    const userSteps = await this.prisma.userPathwayStep.findMany({
      where: { userId, pathwayStep: { pathwayId: pathway.id } },
      select: { pathwayStepId: true, status: true },
    });

    const statuses = computeStepStatuses(pathway.steps, userSteps);
    const progress = computeProgress(pathway.steps, userSteps);

    return {
      career: {
        id: career.id,
        slug: career.slug,
        title: career.title,
        roleSummary: career.roleSummary,
        retired: career.status === CareerStatus.RETIRED,
      },
      pathway: { id: pathway.id, title: pathway.title },
      progress,
      steps: pathway.steps.map((step) => ({
        id: step.id,
        order: step.order,
        title: step.title,
        skills: step.skills.map(({ skill }) => skill),
        status: statuses.get(step.id) ?? PathwayStepStatus.NOT_STARTED,
      })),
    };
  }
}
