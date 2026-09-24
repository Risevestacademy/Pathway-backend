import { Module } from '@nestjs/common';
import { CareersService } from './careers.service';
import { CareersController } from './careers.controller';

@Module({
  controllers: [CareersController],
  providers: [CareersService],
})
export class CareersModule {}
