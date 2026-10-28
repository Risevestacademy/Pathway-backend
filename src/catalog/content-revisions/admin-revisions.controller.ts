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
import { RevisionsService } from './content-revisions.service';
import { ReviewerDiffResponseDto } from './dto/reviewer-diff-response.dto';

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
      'Returns a reviewer-shaped diff grouped by section: career fields, ' +
        'outlook, steps, resources. Each section has `changed`, `added`, ' +
        '`removed` and `moved` buckets. Sections with no changes are omitted.',
      '',
      'Read-only. The plan that backs this response is the same plan that ' +
        'submit, review, and publish use. Any divergence would let a reviewer ' +
        "approve something publish can't safely apply.",
      '',
      '**stale** — `true` means the live career changed since this revision ' +
        'was created. The reviewer should request a rebase before approving.',
      '',
      '**blockers** — hard stops. Non-empty means publish would fail. E.g. ' +
        'removing a step that learners have completed, missing required ' +
        'career fields, or an empty skills/steps list.',
      '',
      '**advisories** — soft warnings shown as info banners. Do not block ' +
        'approval.',
      '',
      'Field values are sent raw: decimals as strings (`"230000.00"`), ' +
        'arrays as arrays, foreign keys as both the raw UUID (`before` / ' +
        '`after`) and a human label (`beforeLabel` / `afterLabel`). The ' +
        'frontend formats currency and joins arrays.',
    ].join('\n'),
  })
  @ApiResponse({
    status: 200,
    type: ReviewerDiffResponseDto,
    example: {
      revisionId: 'a3f2c1d4-0000-0000-0000-000000000000',
      title: 'UX Designer: salary range',
      submittedBy: 'Chidi E.',
      submittedAt: '5 hours ago',
      baseVersion: 3,
      liveVersion: 3,
      stale: false,
      blockers: [],
      advisories: [],
      sections: {
        career: {
          changed: [
            {
              field: 'title',
              label: 'Title',
              before: 'Frontend Engineer',
              after: 'Senior Frontend Engineer',
            },
          ],
          added: [],
          removed: [],
          moved: [],
        },
        outlook: {
          changed: [
            {
              field: 'sourceId',
              label: 'Source',
              before: 'a3f2c1d4-0000-0000-0000-000000000000',
              after: 'b7e2d1a9-0000-0000-0000-000000000000',
              beforeLabel: 'Jobberman salary guide 2025',
              afterLabel: 'Jobberman salary guide 2026',
            },
          ],
          added: [],
          removed: [],
          moved: [],
        },
      },
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
  ): Promise<ReviewerDiffResponseDto> {
    return this.revisionsService.buildDiff(revisionId, user.id);
  }
}
