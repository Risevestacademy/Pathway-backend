import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CareersService } from '../careers.service';
import { TargetLevel } from '../../../generated/prisma/client';

@ApiTags('Careers')
@Controller('target-levels')
export class TargetLevelsController {
  constructor(private readonly careersService: CareersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the target levels careers can be filtered by' })
  @ApiResponse({
    status: 200,
    description:
      'Target level values accepted by the level filter on GET /careers.',
    schema: {
      type: 'array',
      items: { type: 'string', enum: Object.values(TargetLevel) },
      example: Object.values(TargetLevel),
    },
  })
  getTargetLevels(): TargetLevel[] {
    return this.careersService.getTargetLevels();
  }
}
