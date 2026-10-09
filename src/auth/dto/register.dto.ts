import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
import { NormalizeEmail } from '../decorators/normalize-email.decorator';

export class RegisterDto {
  @ApiProperty({
    example: 'Ada Obi',
    description: 'Full name, trimmed. 1 to 100 characters.',
    minLength: 1,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  fullName: string;

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
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;
}
