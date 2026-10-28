import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma'; // adjust path
import { RevisionsService } from './content-revisons.service';
import { AdminRevisionsController } from './admin-revisions.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminRevisionsController],
  providers: [RevisionsService],
})
export class RevisionsModule {}
