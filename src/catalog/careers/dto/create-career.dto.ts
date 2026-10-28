import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { TargetLevel } from '../../../generated/prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCareerDto {
  @ApiProperty({
    example: 'DevOps Engineer',
    description: 'Unique, ignoring case. Trimmed, 1 to 120 characters.',
    minLength: 1,
    maxLength: 120,
  })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({
    example: 'devops-engineer',
    description:
      'Unique. Lowercased, then lowercase letters, digits and single hyphens, 1 to 100 characters.',
    minLength: 1,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase letters, digits and single hyphens',
  })
  slug: string;

  @ApiProperty({
    format: 'uuid',
    example: '6d1f3c2a-8b4e-4f7a-9c5d-2e1b0a9f8c7d',
    description: 'Career field (category), from GET /fields.',
  })
  @IsUUID()
  fieldId: string;

  @ApiProperty({
    example: 'Automates how software is built, tested and deployed.',
    description: 'One-line card summary. Trimmed, 1 to 300 characters.',
    minLength: 1,
    maxLength: 300,
  })
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  description: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example:
      'Builds and runs the pipelines and infrastructure that ship software.',
    description: 'What the role involves. Trimmed, 1 to 2000 characters.',
    minLength: 1,
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  roleSummary?: string | null;

  @ApiPropertyOptional({
    enum: TargetLevel,
    isArray: true,
    example: [TargetLevel.RECENT_GRAD, TargetLevel.EARLY_CAREER],
    description: 'Target levels. Defaults to none.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(TargetLevel, { each: true })
  targetLevels?: TargetLevel[];
}
