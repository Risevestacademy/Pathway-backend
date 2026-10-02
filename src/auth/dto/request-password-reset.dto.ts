import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from '../decorators/normalize-email.decorator';

export class RequestPasswordResetDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address of the account to reset.',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
