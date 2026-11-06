import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';
import { isVisible } from './opportunities.rules';

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveOpportunity(
    userId: string,
    opportunityId: string,
  ): Promise<SaveOpportunityResponseDto> {
    const opportunity = await this.prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { verification: true, deadline: true, deadlineUnknown: true },
    });

    if (!opportunity || !isVisible(opportunity, new Date())) {
      this.logger.warn(
        {
          userId,
          opportunityId,
          reason: opportunity
            ? 'OPPORTUNITY_NOT_VISIBLE'
            : 'OPPORTUNITY_NOT_FOUND',
        },
        'Opportunity save rejected',
      );
      throw new NotFoundException('Opportunity not found');
    }

    const { count } = await this.prisma.userSavedOpportunity.createMany({
      data: [{ userId, opportunityId }],
      skipDuplicates: true,
    });

    if (count > 0) {
      this.logger.log({ userId, opportunityId }, 'Opportunity saved');
    }

    const { savedAt } =
      await this.prisma.userSavedOpportunity.findUniqueOrThrow({
        where: { userId_opportunityId: { userId, opportunityId } },
        select: { savedAt: true },
      });

    return { opportunityId, savedAt };
  }

  async unsaveOpportunity(
    userId: string,
    opportunityId: string,
  ): Promise<void> {
    const { count } = await this.prisma.userSavedOpportunity.deleteMany({
      where: { userId, opportunityId },
    });

    if (count > 0) {
      this.logger.log({ userId, opportunityId }, 'Opportunity unsaved');
    }
  }
}
