import { Module } from '@nestjs/common';
import { PathwaysModule } from '../catalog/pathways';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PathwaysModule],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
