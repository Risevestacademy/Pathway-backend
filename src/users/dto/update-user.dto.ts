import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateUserDto {
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
}
