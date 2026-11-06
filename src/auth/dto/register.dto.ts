import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../decorators/normalize-email.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({
    example: 'Ada',
    description: 'First name, 1 to 100 characters.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName: string;

  @ApiPropertyOptional({
    example: 'Obi',
    description: 'Last name, 1 to 100 characters.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @ApiProperty({ example: 'user@example.com' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
