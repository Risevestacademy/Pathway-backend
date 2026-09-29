import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { SkillListItemDto } from './dto/list-skills.dto';

@ApiTags('Skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all skills' })
  @ApiResponse({
    status: 200,
    description:
      'All skills sorted by name. Returns an empty array if there are none.',
    type: [SkillListItemDto],
  })
  async getSkills(): Promise<SkillListItemDto[]> {
    return this.skillsService.getSkills();
  }
}
