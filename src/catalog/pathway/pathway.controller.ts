import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PathwayService } from './pathway.service';
import { PathwayMetadataDto } from './dto/pathway-metadata.dto';

@ApiTags('Pathways')
@Controller('pathways')
export class PathwayController {
  constructor(private readonly pathwayService: PathwayService) {}

  @Get(':pathwayId')
  @ApiOperation({
    summary: "Get a published pathway's metadata (no steps or resources)",
  })
  @ApiParam({ name: 'pathwayId', description: 'Pathway UUID' })
  @ApiResponse({
    status: 200,
    description: 'Pathway metadata only. Steps and resources are not embedded.',
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
    return this.pathwayService.getPathwayMetadata(pathwayId);
  }
}
