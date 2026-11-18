import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkillsAssessmentService } from './skills-assessment.service';
import { AssessmentResponseDto } from './dto/assessment-response.dto';
import {
  SaveAssessmentDto,
  SaveAssessmentResponseDto,
} from './dto/save-assessment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { type AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UpdateMySkillsDto } from './dto/update-my-skills.dto';
import { SkillsService } from './skills.service';

@ApiTags('Me — Skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/skills')
export class MeSkillsController {
  constructor(
    private readonly skillsAssessmentService: SkillsAssessmentService,
    private readonly skillsService: SkillsService,
  ) {}

  @Get('assessment')
  @ApiOperation({
    summary: "Get the caller's skill assessment grouped by stage",
  })
  @ApiResponse({ status: 200, type: AssessmentResponseDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 404, description: 'No active pathway for this user' })
  async getAssessment(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssessmentResponseDto> {
    return this.skillsAssessmentService.getAssessment(user.id);
  }

  @Put('assessment')
  @ApiOperation({
    summary: "Save the caller's skill assessment and return the results page",
  })
  @ApiResponse({ status: 200, type: SaveAssessmentResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation error, unknown skillId, or rating on non-HAVE',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 404, description: 'No active pathway for this user' })
  async saveAssessment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveAssessmentDto,
  ): Promise<SaveAssessmentResponseDto> {
    return this.skillsAssessmentService.saveAssessment(user.id, dto);
  }

  @Delete('assessment')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Reset the caller's skill assessment" })
  @ApiResponse({ status: 204, description: 'Assessment cleared.' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 404, description: 'No active pathway for this user' })
  async resetAssessment(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.skillsAssessmentService.resetAssessment(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Replace the caller's profile skills" })
  @ApiResponse({ status: 204, description: 'Skills updated.' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or unknown skill IDs',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  async updateMySkills(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMySkillsDto,
  ): Promise<void> {
    return this.skillsService.updateMySkills(user.id, dto.skillIds);
  }
}
