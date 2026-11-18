import { Module } from '@nestjs/common';
import { PathwaysModule } from '../catalog/pathways';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ActivityModule } from '../activity';

@Module({
  imports: [PathwaysModule, ActivityModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
