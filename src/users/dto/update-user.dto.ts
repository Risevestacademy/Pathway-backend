import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
  TargetLevel,
} from '../../generated/prisma/client';

export const LEARNING_GOALS_MAX = 10;
export const CAREER_INTERESTS_MAX = 20;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item: unknown) =>
        typeof item === 'string' ? item.trim() : item,
      )
    : value;

// Omitted fields are unchanged; an explicit null clears the field
export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Ada',
    description: 'First name, 1 to 100 characters. Cannot be null.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Obi',
    description: 'Last name, 1 to 100 characters.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  lastName?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example:
      'https://res.cloudinary.com/pathway/image/upload/v1/avatars/123e4567-e89b-12d3-a456-426614174000/photo.jpg',
    description:
      "Cloudinary URL from the signed avatar upload, in the user's own avatars folder.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    enum: TargetLevel,
    nullable: true,
    example: TargetLevel.STUDENT,
  })
  @IsOptional()
  @IsEnum(TargetLevel)
  careerStage?: TargetLevel | null;

  @ApiPropertyOptional({
    enum: EducationLevel,
    nullable: true,
    example: EducationLevel.BACHELOR_IN_PROGRESS,
  })
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel | null;

  @ApiPropertyOptional({
    enum: InternshipCount,
    nullable: true,
    example: InternshipCount.ONE,
  })
  @IsOptional()
  @IsEnum(InternshipCount)
  internshipCount?: InternshipCount | null;

  @ApiPropertyOptional({
    enum: ExperienceYears,
    nullable: true,
    example: ExperienceYears.UNDER_ONE,
  })
  @IsOptional()
  @IsEnum(ExperienceYears)
  experienceYears?: ExperienceYears | null;

  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    example: ['Land a first internship'],
    description: `Up to ${LEARNING_GOALS_MAX} goals, 1 to 100 characters each. Null clears the list.`,
  })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(LEARNING_GOALS_MAX)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  learningGoals?: string[] | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '5-10 hours a week',
    description: '1 to 50 characters.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  weeklyTimeCommitment?: string | null;

  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    example: ['software-engineering', 'design'],
    description: `Field slugs from GET /fields, up to ${CAREER_INTERESTS_MAX}, no duplicates. Null clears the list.`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CAREER_INTERESTS_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  careerInterests?: string[] | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Usage analytics opt-in. Cannot be null.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  analyticsEnabled?: boolean;
}
