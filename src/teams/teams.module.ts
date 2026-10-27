import { Module } from '@nestjs/common';
import { AdminTeamsController } from './admin.controller';
import { TeamsService } from './teams.service';
import { AnalyticsModule } from '../analytics';
import { NotificationsModule } from '../notifications';

@Module({
  controllers: [AdminTeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
  imports: [NotificationsModule, AnalyticsModule],
})
export class TeamsModule {}
