import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
  MinRole,
  RolesGuard,
} from '../../common';
import { Role } from '../../generated/prisma/client';
import { RevisionsService } from './content-revisons.service';
import type { CareerPlan } from './career-snapshot.plan';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/revisions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminRevisionsController {
  constructor(private readonly revisionsService: RevisionsService) {}

  @ApiOperation({
    summary: 'Preview the diff for a revision',
    description:
      'Minimum role: REVIEWER. Returns the plan that submit, review and publish would apply. Read-only.',
  })
  @ApiResponse({ status: 200, description: 'The plan for this revision.' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below REVIEWER' })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  @Get(':revisionId/diff')
  @MinRole(Role.REVIEWER)
  async getDiff(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CareerPlan> {
    return this.revisionsService.buildDiff(revisionId, user.id);
  }
}
