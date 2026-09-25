import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { CareersService } from './careers.service';
import { CareerListItemDto } from './dto/list-careers.dto';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { TargetLevel } from '../../generated/prisma/client';
import { CareerDetailDto } from './dto/career-detail.dto';
import { CareerPathwayResponseDto } from './dto/career-pathway.dto';

@ApiTags('Careers')
@Controller('careers')
export class CareersController {
  constructor(private readonly careersService: CareersService) {}

  @Get()
  @ApiOperation({ summary: 'Get a public catalogue of published careers' })
  @ApiQuery({ name: 'level', required: false, enum: TargetLevel })
  @ApiQuery({
    name: 'interest',
    required: false,
    type: String,
    description: 'Filter by field slug (e.g., "software-engineering")',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of published careers. Returns an empty array if no matches are found.',
    type: [CareerListItemDto],
  })
  async getCareers(
    @Query() query: GetCareersQueryDto,
  ): Promise<CareerListItemDto[]> {
    return this.careersService.getPublicCareers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get the full detail page for a published career' })
  @ApiParam({ name: 'id', description: 'Career UUID' })
  @ApiResponse({
    status: 200,
    description: 'Full detail for a published career, including outlook data.',
    type: CareerDetailDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Career does not exist, or exists but is not PUBLISHED.',
  })
  async getCareerById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CareerDetailDto> {
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
    return this.careersService.getCareerPathway(careerId);
  }
}
