import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { createValidationPipe } from './pipes/validation.pipe';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useFactory: createValidationPipe,
    },
  ],
})
export class CommonModule {}
