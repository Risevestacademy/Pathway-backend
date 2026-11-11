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
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
} from '../../common';
import { CareersService } from './careers.service';
import { SaveCareerResponseDto } from './dto/save-career-response.dto';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { TargetLevel } from '../../generated/prisma/client';
import { CareerPathwayResponseDto } from './pathways/dto/career-pathway.dto';
import { PathwaysService } from './pathways/pathways.service';
import { CareerListResponseDto } from './dto/career-list-response.dto';
import { CareerDetailResponseDto } from './dto/career-detail-response.dto';

@ApiTags('Careers')
@Controller('careers')
export class CareersController {
  constructor(
    private readonly careersService: CareersService,
    private readonly pathwaysService: PathwaysService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get a public catalogue of published careers',
    description:
      'Returns catalog-wide totals plus the published careers matching the filters, ordered by title.',
  })
  @ApiQuery({ name: 'level', required: false, enum: TargetLevel })
  @ApiQuery({
    name: 'interest',
    required: false,
    type: String,
    description: 'Filter by field slug (e.g., "software-engineering")',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalog totals plus a list of published career cards.',
    type: CareerListResponseDto,
  })
  async getCareers(
    @Query() query: GetCareersQueryDto,
  ): Promise<CareerListResponseDto> {
    return this.careersService.getPublicCareers(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get details for a published career',
    description:
      'Returns overview, projection and requirements together, so the detail page ' +
      'renders all three tabs from a single request.',
  })
  @ApiParam({ name: 'id', description: 'Career UUID' })
  @ApiResponse({
    status: 200,
    description:
      'Overview, projection and requirements for a published career.',
    type: CareerDetailResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Career does not exist, or exists but is not PUBLISHED.',
  })
  async getCareerById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CareerDetailResponseDto> {
    return this.careersService.getPublishedCareerById(id);
  }

  @Get(':careerId/pathway')
  @ApiOperation({
    summary: "Get a published career's complete ordered pathway",
  })
  @ApiParam({ name: 'careerId', description: 'Career UUID' })
  @ApiResponse({
    status: 200,
    description:
      "The career's pathway, wrapped as { pathway }. pathway is null if the " +
      'career has no pathway yet.',
    type: CareerPathwayResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Career does not exist, or exists but is not PUBLISHED.',
  })
  async getCareerPathway(
    @Param('careerId', ParseUUIDPipe) careerId: string,
  ): Promise<CareerPathwayResponseDto> {
    return this.pathwaysService.getCareerPathway(careerId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Save a career for the signed-in user',
    description:
      'Only a PUBLISHED career can be newly saved. Saving is idempotent and never starts or changes a pathway. Re-saving a career that was saved before it was retired returns the existing save.',
  })
  @ApiParam({ name: 'id', description: 'Career UUID' })
  @ApiResponse({ status: 200, type: SaveCareerResponseDto })
  @ApiResponse({ status: 400, description: 'Malformed career id' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({
    status: 404,
    description: 'Career does not exist, or is not PUBLISHED and not saved',
  })
  @UseGuards(JwtAuthGuard)
  @Put(':id/save')
  async saveCareer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaveCareerResponseDto> {
    return this.careersService.saveCareer(user.id, id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove a career from the user's saves" })
  @ApiParam({ name: 'id', description: 'Career UUID' })
  @ApiResponse({ status: 204, description: 'The career is not saved' })
  @ApiResponse({ status: 400, description: 'Malformed career id' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @UseGuards(JwtAuthGuard)
  @Delete(':id/save')
  @HttpCode(204)
  async unsaveCareer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.careersService.unsaveCareer(user.id, id);
  }
}
