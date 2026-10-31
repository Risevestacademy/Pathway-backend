import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { RevisionsService } from './content-revisions.service';
import { AdminRevisionsController } from './admin-revisions.controller';
import { ReviewerDiffFormatter } from './reviewer-diff.formatter';

@Module({
  imports: [PrismaModule],
  controllers: [AdminRevisionsController],
  providers: [RevisionsService, ReviewerDiffFormatter],
  exports: [RevisionsService],
})
export class RevisionsModule {}
