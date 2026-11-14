import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../common';
import { DashboardService } from './dashboard.service';
import { DashboardDto } from './dto/dashboard-response.dto';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({
    summary: "Everything the signed-in user's dashboard renders",
    description:
      "Totals, streak, a 365-day activity heatmap, earned badges, the active pathway with its progress and next step, and today's goals. A new user gets zeros and empty lists. Values are the same whether or not the user has opted out of analytics.",
  })
  @ApiResponse({ status: 200, type: DashboardDto })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Get()
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DashboardDto> {
    return this.dashboardService.getDashboard(user.id);
  }
}
