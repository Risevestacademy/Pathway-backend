import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PathwaysService } from './pathways.service';
import { PathwayMetadataDto } from './dto/pathway-metadata.dto';

@ApiTags('Pathways')
@Controller('pathways')
export class PathwaysController {
  constructor(private readonly pathwaysService: PathwaysService) {}

  @Get(':pathwayId')
  @ApiOperation({
    summary:
      "Get a published pathway's metadata and slim ordered steps " +
      '(no resources or full step detail)',
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiResponse({
    status: 200,
    description:
      'Pathway metadata with slim ordered step summaries. Resources and ' +
      'full step detail are served by GET /pathway-steps/:stepId.',
    type: PathwayMetadataDto,
  })
  @ApiResponse({
    status: 400,
    description: 'pathwayId is not a valid UUID.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Pathway does not exist, or belongs to a career that is not PUBLISHED.',
  })
  async getPathwayMetadata(
    @Param('pathwayId', ParseUUIDPipe) pathwayId: string,
  ): Promise<PathwayMetadataDto> {
    return this.pathwaysService.getPathwayMetadata(pathwayId);
  }
}
