import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
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
import { SaveDraftRevisionDto } from './dto/save-draft-revision.dto';
import { SaveDraftRevisionResponseDto } from './dto/save-draft-revision-response.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/careers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCareerRevisionsController {
  constructor(private readonly revisionsService: RevisionsService) {}

  @ApiOperation({
    summary: "Save the career's draft revision",
    description:
      'Minimum role: EDITOR. The body is the full proposed snapshot and replaces the stored one; it is not a patch. Updates the open DRAFT revision, or creates one with baseVersion set to the live career version. A career has at most one open (DRAFT or IN_REVIEW) revision. A revision in review is never edited: recall it first.',
  })
  @ApiParam({ name: 'careerId', format: 'uuid' })
  @ApiResponse({ status: 200, type: SaveDraftRevisionResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'careerId is not a UUID (BAD_REQUEST), the body failed validation (VALIDATION_ERROR), or the snapshot is inconsistent (BAD_REQUEST, code INVALID_SNAPSHOT, details.problems)',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({ status: 404, description: 'Career not found' })
  @ApiResponse({
    status: 409,
    description:
      'The open revision is in review (CONFLICT, code REVISION_IN_REVIEW, details.revisionId), or the career is retired (CONFLICT, code CAREER_RETIRED)',
  })
  @MinRole(Role.EDITOR)
  @Put(':careerId/revision')
  async saveDraftRevision(
    @Param('careerId', ParseUUIDPipe) careerId: string,
    @Body() snapshot: SaveDraftRevisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SaveDraftRevisionResponseDto> {
    return this.revisionsService.saveDraftRevision(careerId, snapshot, user.id);
  }
}
