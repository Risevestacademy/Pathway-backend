import { Module } from '@nestjs/common';
import { PathwaysModule } from '../catalog/pathways';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { MeOpportunitiesController } from './me-opportunities.controller';

@Module({
  imports: [PathwaysModule],
  controllers: [OpportunitiesController, MeOpportunitiesController],
  providers: [OpportunitiesService],
})
export class OpportunitiesModule {}
