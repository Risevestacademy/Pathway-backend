// src/careers/careers.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { CareersService } from './careers.service';
import { CareerListItemDto } from './dto/list-careers.dto';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { TargetLevel } from '../../generated/prisma/client';

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
}
