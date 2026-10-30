import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { CreateCareerDto } from './dto/create-career.dto';
import { CreateCareerResponseDto } from './dto/create-career-response.dto';
import {
  AdminCareerDetailDto,
  AdminCareerListResponseDto,
} from './dto/admin-career.dto';
import { GetAdminCareersQueryDto } from './dto/get-admin-careers-query.dto';
import {
  ADMIN_CAREER_MAX_STEPS,
  ADMIN_STEP_MAX_RESOURCES,
} from './admin-career-read';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCareersController {
  constructor(private readonly careersService: CareersService) {}

  @ApiOperation({
    summary: 'Create a draft career',
    description:
      'Minimum role: EDITOR. Creates the career in DRAFT at version 1, with its first DRAFT revision (baseVersion 1), in one write. Title and slug are unique, ignoring case.',
  })
  @ApiResponse({ status: 201, type: CreateCareerResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Body failed validation (VALIDATION_ERROR), or fieldId matches no field (BAD_REQUEST, code FIELD_NOT_FOUND)',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({
    status: 409,
    description:
      'The title or slug is taken (CONFLICT, code CAREER_TITLE_TAKEN or CAREER_SLUG_TAKEN)',
  })
  @MinRole(Role.EDITOR)
  @Post('careers')
  async createCareer(
    @Body() dto: CreateCareerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateCareerResponseDto> {
    return this.careersService.createCareer(dto, user.id);
  }

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

  @ApiOperation({
    summary: 'List careers in any status',
    description:
      'Minimum role: EDITOR. Includes DRAFT and RETIRED careers, which public endpoints never return. Most recently updated first. search matches the title or slug, ignoring case.',
  })
  @ApiResponse({ status: 200, type: AdminCareerListResponseDto })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @MinRole(Role.EDITOR)
  @Get('careers')
  async listCareers(
    @Query() query: GetAdminCareersQueryDto,
  ): Promise<AdminCareerListResponseDto> {
    return this.careersService.listCareersForStaff(query);
  }

  @ApiOperation({
    summary: 'Get a career in any status',
    description: `Minimum role: EDITOR. The live career with its skills, outlook, and pathway steps with their skills and linked resources (WITHDRAWN resources included). Steps are capped at ${ADMIN_CAREER_MAX_STEPS} and resources per step at ${ADMIN_STEP_MAX_RESOURCES}. Revisions are never included.`,
  })
  @ApiResponse({ status: 200, type: AdminCareerDetailDto })
  @ApiResponse({ status: 400, description: 'id is not a UUID' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user is below EDITOR' })
  @ApiResponse({ status: 404, description: 'Career not found' })
  @MinRole(Role.EDITOR)
  @Get('careers/:id')
  async getCareer(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminCareerDetailDto> {
    return this.careersService.getCareerForStaff(id);
  }
}
