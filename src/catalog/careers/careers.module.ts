import { Module } from '@nestjs/common';
import { CareersService } from './careers.service';
import { CareersController } from './careers.controller';
import { PathwaysService } from './pathways/pathways.service';

@Module({
  controllers: [CareersController],
  providers: [CareersService, PathwaysService],
})
export class CareersModule {}
