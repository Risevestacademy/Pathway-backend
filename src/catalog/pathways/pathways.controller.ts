import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common';
import { OptionalJwtAuthGuard } from '../../common';
import { PathwaysService } from './pathways.service';
import { PathwayReadDto } from './dto/pathway-read.dto';

@ApiTags('Pathways')
@Controller('pathways')
export class PathwaysController {
  constructor(private readonly pathwaysService: PathwaysService) {}

  @Get(':pathwayId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      "Get a pathway's overview, stage progress, and the next step's details",
    description:
      'Returns the career header, every stage with its steps, and progress. Resources and tasks are included only for the next step and the start step. Works for published and retired careers.',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiResponse({ status: 200, type: PathwayReadDto })
  @ApiResponse({ status: 400, description: 'pathwayId is not a valid UUID.' })
  @ApiResponse({
    status: 404,
    description: 'Pathway not found, or its career is a draft.',
  })
  async getPathwayRead(
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<PathwayReadDto> {
    return this.pathwaysService.getPathwayRead(pathwayId, req.user?.id ?? null);
  }
}
