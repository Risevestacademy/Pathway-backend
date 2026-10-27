import {
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  JwtAuthGuard,
  MinRole,
  RolesGuard,
} from '../../common';
import { Role } from '../../generated/prisma/client';
import { CareersService } from './careers.service';
import { DeleteCareerResponseDto } from './dto/delete-career-response.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCareersController {
  constructor(private readonly careersService: CareersService) {}

  @ApiOperation({
    summary: 'Delete a never-published draft career',
    description:
      'Minimum role: ADMIN. Only a DRAFT career that was never published and that no user has saved can be deleted. Its pathway, skills, outlook and revisions are deleted with it.',
  })
  @ApiResponse({ status: 200, type: DeleteCareerResponseDto })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is not an admin' })
  @ApiResponse({ status: 404, description: 'Career not found' })
  @ApiResponse({
    status: 409,
    description:
      'The career is published, retired, was published before, or has been saved by a user',
  })
  @MinRole(Role.ADMIN)
  @Delete('careers/:id')
  async deleteCareer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeleteCareerResponseDto> {
    return this.careersService.deleteCareer(id, user.id);
  }
}
