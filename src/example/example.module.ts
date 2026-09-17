import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

/**
 * Only export the service (and the module itself) — that's the whole
 * point of the ownership rule. Nothing outside this module should be
 * able to import ExampleController directly, and nothing outside this
 * module gets to touch this domain's Prisma models except through
 * ExampleService's methods.
 */
@Module({
  controllers: [ExampleController],
  providers: [ExampleService],
  exports: [ExampleService],
})
export class ExampleModule {}
