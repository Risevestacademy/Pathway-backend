import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import {
  buildOpportunityListWhere,
  OPPORTUNITY_LIST_ORDER_BY,
  OPPORTUNITY_LIST_SELECT,
  toOpportunityListItem,
} from './opportunity-list';

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listOpportunities(
    query: GetOpportunitiesQueryDto,
  ): Promise<OpportunityListItemDto[]> {
    const now = new Date();

    const rows = await this.prisma.opportunity.findMany({
      where: buildOpportunityListWhere(query, now),
      orderBy: OPPORTUNITY_LIST_ORDER_BY,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: OPPORTUNITY_LIST_SELECT,
    });

    return rows.map((row) => toOpportunityListItem(row, now));
  }
}
