import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PathwaysService } from '../catalog/pathways';
import { PrismaService } from '../prisma';
import type { MeOpportunityScope } from './dto/get-me-opportunities-query.dto';
import { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import { OpportunityDetailDto } from './dto/opportunity-detail.dto';
import { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';
import { isVisible } from './opportunities.rules';
import {
  buildOpportunityDetailWhere,
  OPPORTUNITY_DETAIL_SELECT,
  toOpportunityDetail,
} from './opportunity-detail';
import {
  buildOpportunityListWhere,
  type OpportunityListFilter,
  OPPORTUNITY_LIST_ORDER_BY,
  OPPORTUNITY_LIST_SELECT,
  toOpportunityListItem,
} from './opportunity-list';

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pathwaysService: PathwaysService,
  ) {}

  async listOpportunities(
    query: GetOpportunitiesQueryDto,
  ): Promise<OpportunityListItemDto[]> {
    return this.findListItems(query, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async listMyOpportunities(
    userId: string,
    scope: MeOpportunityScope,
  ): Promise<OpportunityListItemDto[]> {
    switch (scope) {
      case 'pathway':
        return this.listPathwayOpportunities(userId);
    }
  }

  private async listPathwayOpportunities(
    userId: string,
  ): Promise<OpportunityListItemDto[]> {
    const { career } = await this.pathwaysService.getActivePathway(userId);
    if (!career) return [];

    return this.findListItems({ careerId: career.id });
  }

  private async findListItems(
    filter: OpportunityListFilter,
    page?: { skip: number; take: number },
  ): Promise<OpportunityListItemDto[]> {
    const now = new Date();

    const rows = await this.prisma.opportunity.findMany({
      where: buildOpportunityListWhere(filter, now),
      orderBy: OPPORTUNITY_LIST_ORDER_BY,
      ...page,
      select: OPPORTUNITY_LIST_SELECT,
    });

    return rows.map((row) => toOpportunityListItem(row, now));
  }

  async getOpportunityById(id: string): Promise<OpportunityDetailDto> {
    const row = await this.prisma.opportunity.findFirst({
      where: buildOpportunityDetailWhere(id),
      select: OPPORTUNITY_DETAIL_SELECT,
    });

    if (!row) {
      throw new NotFoundException('Opportunity not found');
    }

    return toOpportunityDetail(row, new Date());
  }

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
