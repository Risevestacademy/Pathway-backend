import {
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
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
import { OpportunitiesService } from './opportunities.service';
import { SaveOpportunityResponseDto } from './dto/save-opportunity-response.dto';

@ApiTags('Opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

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
