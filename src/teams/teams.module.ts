import { Module } from '@nestjs/common';
import { AdminTeamsController } from './admin.controller';
import { TeamsService } from './teams.service';

@Module({
  controllers: [AdminTeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
