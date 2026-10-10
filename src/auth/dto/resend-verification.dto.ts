import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from '../decorators/normalize-email.decorator';

export class ResendVerificationDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address of the account to resend verification to.',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
