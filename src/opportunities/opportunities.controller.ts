import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('Opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @ApiOperation({
    summary: 'List visible opportunities',
    description:
      'Public. Only visible listings appear: VERIFIED, with a future deadline or an unknown (rolling) one. Draft, withdrawn and closed listings are never returned. Sorted by deadline, soonest first, with rolling listings last. "See more like this" and "See similar roles" use careerId with excludeId. An empty result is [].',
  })
  @ApiResponse({ status: 200, type: [OpportunityListItemDto] })
  @ApiResponse({
    status: 400,
    description:
      'type is not an OpportunityType, careerId or excludeId is not a UUID, or another query value is invalid (VALIDATION_ERROR)',
  })
  @Get()
  async listOpportunities(
    @Query() query: GetOpportunitiesQueryDto,
  ): Promise<OpportunityListItemDto[]> {
    return this.opportunitiesService.listOpportunities(query);
  }
}
