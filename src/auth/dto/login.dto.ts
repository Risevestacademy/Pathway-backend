import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from '../decorators/normalize-email.decorator';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address.',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Account password. Must be at least 8 characters.',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
