import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { NormalizeEmail } from '../decorators/normalize-email.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiPropertyOptional({
    example: 'Ada',
    description:
      'First name, 1 to 50 characters. Required unless fullName is sent.',
  })
  @ValidateIf((o: RegisterDto) => o.fullName == null || o.firstName != null)
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Obi',
    description:
      'Last name, 1 to 50 characters. Required unless fullName is sent.',
  })
  @ValidateIf((o: RegisterDto) => o.fullName == null || o.lastName != null)
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  lastName?: string;

  @ApiPropertyOptional({
    deprecated: true,
    example: 'Ada Obi',
    description:
      'Legacy field, kept so older clients keep working. If sent without firstName and lastName, it is split on the first space.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  fullName?: string;

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
