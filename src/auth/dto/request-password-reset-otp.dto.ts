import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestPasswordResetOtpDto {
  @ApiProperty({
    example: 'ada@example.com',
    description: 'Email of the account to reset.',
  })
  @IsEmail()
  email: string;
}
