import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../common';
import { GetMeOpportunitiesQueryDto } from './dto/get-me-opportunities-query.dto';
import { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me/opportunities')
@UseGuards(JwtAuthGuard)
export class MeOpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @ApiOperation({
    summary: "List opportunities for the signed-in user's active pathway",
    description:
      "Visible listings linked to the career of the user's active pathway, in the same shape and order as GET /opportunities. A user with no active pathway gets [].",
  })
  @ApiResponse({ status: 200, type: [OpportunityListItemDto] })
  @ApiResponse({
    status: 400,
    description: 'scope is missing or not pathway (VALIDATION_ERROR)',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Get()
  async listMyOpportunities(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetMeOpportunitiesQueryDto,
  ): Promise<OpportunityListItemDto[]> {
    return this.opportunitiesService.listMyOpportunities(user.id, query.scope);
  }
}
