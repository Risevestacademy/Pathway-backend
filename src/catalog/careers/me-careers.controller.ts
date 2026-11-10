import { Controller, Get, UseGuards } from '@nestjs/common';
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
} from '../../common';
import { CareersService } from './careers.service';
import { SavedCareerListItemDto } from './dto/saved-career-list-item.dto';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me/careers')
@UseGuards(JwtAuthGuard)
export class MeCareersController {
  constructor(private readonly careersService: CareersService) {}

  @ApiOperation({
    summary: "List the signed-in user's saved careers",
    description:
      'Most recently saved first, with the same card fields as GET /careers. A career retired after it was saved stays listed with isRetired true. A user with no saves gets [].',
  })
  @ApiResponse({ status: 200, type: [SavedCareerListItemDto] })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Get()
  async listSavedCareers(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SavedCareerListItemDto[]> {
    return this.careersService.listSavedCareers(user.id);
  }
}
