import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
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

@ApiTags('Me — Skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/skills')
export class MeSkillsController {
  constructor(
    private readonly skillsAssessmentService: SkillsAssessmentService,
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
    summary: "Save the caller's skill assessment (only the skills sent)",
  })
  @ApiResponse({ status: 200, type: SaveAssessmentResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation error or unknown skillId',
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @ApiResponse({ status: 404, description: 'No active pathway for this user' })
  async saveAssessment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveAssessmentDto,
  ): Promise<SaveAssessmentResponseDto> {
    return this.skillsAssessmentService.saveAssessment(user.id, dto);
  }
}
