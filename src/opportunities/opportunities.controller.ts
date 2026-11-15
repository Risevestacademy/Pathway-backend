import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  DomainException,
  JwtAuthGuard,
  OptionalJwtAuthGuard,
} from '../common';
import { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import { OpportunityDetailDto } from './dto/opportunity-detail.dto';
import {
  OpportunityListItemDto,
  SavedOpportunityListItemDto,
} from './dto/opportunity-list-item.dto';
import { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('Opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @ApiOperation({
    summary: 'List visible opportunities',
    description:
      'Public. Only visible listings appear: VERIFIED, with a future deadline or no deadline. Draft and withdrawn listings are never returned. Sorted by deadline, soonest first, with no-deadline listings last. "See more like this" and "See similar roles" use careerId with excludeId. An empty result is []. A valid access token adds isSaved to each item; an invalid or expired token is treated as anonymous and sets the X-Auth-Status response header. saved=true filters to the caller\'s saved listings and requires authentication.',
  })
  @ApiHeader({
    name: 'X-Auth-Status',
    required: false,
    enum: ['expired', 'invalid'],
    description:
      'Present only when an Authorization header was sent but rejected. The request is served as anonymous.',
  })
  @ApiResponse({ status: 200, type: [OpportunityListItemDto] })
  @ApiResponse({
    status: 400,
    description:
      'type is not an OpportunityType, careerId or excludeId is not a UUID, saved is not a boolean, or another query value is invalid (VALIDATION_ERROR). Also SAVED_FILTER_REQUIRES_AUTH when saved=true is sent without authentication.',
  })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async listOpportunities(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: GetOpportunitiesQueryDto,
  ): Promise<OpportunityListItemDto[] | SavedOpportunityListItemDto[]> {
    if (query.saved && !user) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'SAVED_FILTER_REQUIRES_AUTH',
        'saved=true requires authentication',
      );
    }

    return this.opportunitiesService.listOpportunities(query, user?.id);
  }

  @ApiOperation({
    summary: 'Get one opportunity',
    description:
      'Public. Returns a VERIFIED listing with its careers and skills. A listing past its deadline is still returned, with status CLOSED, so the client can show its closed banner. Draft and withdrawn listings return 404, the same as an unknown id.',
  })
  @ApiParam({ name: 'id', description: 'Opportunity UUID' })
  @ApiResponse({ status: 200, type: OpportunityDetailDto })
  @ApiResponse({ status: 400, description: 'Malformed opportunity id' })
  @ApiResponse({
    status: 404,
    description: 'Opportunity does not exist, or is a draft or withdrawn',
  })
  @Get(':id')
  async getOpportunityById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpportunityDetailDto> {
    return this.opportunitiesService.getOpportunityById(id);
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
