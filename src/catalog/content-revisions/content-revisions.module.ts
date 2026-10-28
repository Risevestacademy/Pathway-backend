import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { RevisionsService } from './content-revisions.service';
import { AdminRevisionsController } from './admin-revisions.controller';
import { AdminCareerRevisionsController } from './admin-career-revisions.controller';
import { ReviewerDiffFormatter } from './reviewer-diff.formatter';

@Module({
  imports: [PrismaModule],
  controllers: [AdminRevisionsController, AdminCareerRevisionsController],
  providers: [RevisionsService, ReviewerDiffFormatter],
  exports: [RevisionsService],
})
export class RevisionsModule {}
