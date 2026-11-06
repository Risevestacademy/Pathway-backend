import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../common';
import { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import { OpportunityListItemDto } from './dto/opportunity-list-item.dto';
import { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';
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

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save an opportunity for the signed-in user' })
  @ApiParam({ name: 'id', description: 'Opportunity UUID' })
  @ApiResponse({ status: 200, type: SaveOpportunityResponseDto })
  @ApiResponse({ status: 400, description: 'Malformed opportunity id' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 404,
    description: 'Opportunity does not exist or is not visible',
  })
  @UseGuards(JwtAuthGuard)
  @Put(':id/save')
  async saveOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaveOpportunityResponseDto> {
    return this.opportunitiesService.saveOpportunity(user.id, id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove an opportunity from the user's saves" })
  @ApiParam({ name: 'id', description: 'Opportunity UUID' })
  @ApiResponse({ status: 204, description: 'The opportunity is not saved' })
  @ApiResponse({ status: 400, description: 'Malformed opportunity id' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @UseGuards(JwtAuthGuard)
  @Delete(':id/save')
  @HttpCode(204)
  async unsaveOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.opportunitiesService.unsaveOpportunity(user.id, id);
  }
}
