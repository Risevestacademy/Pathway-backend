import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { NormalizeEmail } from '../decorators/normalize-email.decorator';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address of the account being verified.',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Six-digit verification code sent to the email address.',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
