import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address.',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Account password. Must be at least 8 characters.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;
}
