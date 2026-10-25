import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ConfirmPasswordResetOtpDto {
  @ApiProperty({
    example: 'ada@example.com',
    description: 'Email of the account to reset.',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '042917',
    description: 'Six-digit code from the password reset email.',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  otp: string;

  @ApiProperty({
    example: 'NewPassword123!',
    description: 'New account password. Must be at least 8 characters.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
