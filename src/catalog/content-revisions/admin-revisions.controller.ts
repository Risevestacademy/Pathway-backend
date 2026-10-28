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
import { CareerPlanResponseDto } from './dto/career-plan-response.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/revisions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminRevisionsController {
  constructor(private readonly revisionsService: RevisionsService) {}

  @ApiOperation({
    summary: 'Preview the diff for a revision',
    description: [
      'Minimum role: REVIEWER.',
      '',
      'Computes the plan that publishing this revision would apply to the live career:',
      'every operation, every blocker, and whether the revision is stale.',
      '',
      'Read-only. The same plan is used by submit (readiness check), review ' +
        '(stale check), and publish (apply). The reviewer UI uses this endpoint to ' +
        'render the diff screen.',
      '',
      '**Stale** — if `true`, the live career changed since this revision was ' +
        'created. Publishing it would silently overwrite those changes. Ask ' +
        'the editor to rebase.',
      '',
      '**Blockers** — if non-empty, publishing will fail. Common cases: a ' +
        'removed step that learners have completed, missing required career ' +
        'fields, or an empty skills/steps list.',
    ].join('\n'),
  })
  @ApiResponse({
    status: 200,
    type: CareerPlanResponseDto,
    example: {
      baseVersion: 3,
      liveVersion: 3,
      stale: false,
      operations: [
        {
          kind: 'update',
          section: 'career',
          entityId: 'a3f2c1d4-0000-0000-0000-000000000000',
          field: 'title',
          before: 'Frontend Engineer',
          after: 'Senior Frontend Engineer',
        },
        {
          kind: 'move',
          section: 'steps',
          entityId: 'b4e3d2c1-0000-0000-0000-000000000000',
          before: 2,
          after: 1,
        },
      ],
      blockers: [],
      counts: { added: 0, changed: 1, moved: 1, removed: 0, blockers: 0 },
    },
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below REVIEWER' })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  @Get(':revisionId/diff')
  @MinRole(Role.REVIEWER)
  async getDiff(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CareerPlanResponseDto> {
    return this.revisionsService.buildDiff(revisionId, user.id);
  }
}
