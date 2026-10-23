import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
} from '../../common';
import { PathwaysService } from './pathways.service';
import { SetActivePathwayDto } from './dto/set-active-pathway.dto';
import { ActivePathwayResponseDto } from './dto/active-pathway-response.dto';
import { SavedPathwayDto } from './dto/saved-pathway.dto';
import { SetStartingPointDto } from './dto/set-starting-point.dto';
import { StartingPointResponseDto } from './dto/starting-point-response.dto';

@ApiTags('Me')
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly pathwaysService: PathwaysService) {}

  @ApiOperation({ summary: "Set the signed-in user's active pathway" })
  @ApiResponse({ status: 200, type: ActivePathwayResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Career does not exist or is not PUBLISHED',
  })
  @ApiResponse({ status: 409, description: 'The career has no pathway yet' })
  @Put('active-pathway')
  async setActivePathway(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetActivePathwayDto,
  ): Promise<ActivePathwayResponseDto> {
    return this.pathwaysService.setActivePathway(user.id, dto.careerId);
  }

  @ApiOperation({ summary: "Get the signed-in user's active pathway" })
  @ApiResponse({ status: 200, type: ActivePathwayResponseDto })
  @Get('active-pathway')
  async getActivePathway(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivePathwayResponseDto> {
    return this.pathwaysService.getActivePathway(user.id);
  }

  @ApiOperation({
    summary: "List the signed-in user's saved, visible pathways",
  })
  @ApiResponse({ status: 200, type: [SavedPathwayDto] })
  @Get('pathways')
  async getSavedPathways(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SavedPathwayDto[]> {
    return this.pathwaysService.getSavedPathways(user.id);
  }

  @ApiOperation({
    summary: 'Set, change or clear the starting step of a saved pathway',
  })
  @ApiParam({ name: 'careerId', description: 'Career UUID' })
  @ApiResponse({ status: 200, type: StartingPointResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "careerId or stepId is not a valid UUID, or the step isn't in this career's pathway",
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 404,
    description: "The user hasn't saved this career, or it isn't visible",
  })
  @Put('pathways/:careerId/starting-point')
  async setStartingPoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('careerId', ParseUUIDPipe) careerId: string,
    @Body() dto: SetStartingPointDto,
  ): Promise<StartingPointResponseDto> {
    return this.pathwaysService.setStartingPoint(user.id, careerId, dto.stepId);
  }
}
