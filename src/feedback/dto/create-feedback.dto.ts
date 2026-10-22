import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackSection,
} from '../../generated/prisma/client';

export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackCategory, example: 'BROKEN_LINK' })
  @IsEnum(FeedbackCategory)
  category: FeedbackCategory;

  @ApiProperty({
    example: 'The link on step 3 returns a 404.',
    description: 'What the user wants to report. 1 to 2000 characters.',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000)
  description: string;

  @ApiPropertyOptional({
    enum: FeedbackSection,
    default: FeedbackSection.GENERAL,
    example: 'RESOURCES',
  })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsEnum(FeedbackSection)
  section: FeedbackSection = FeedbackSection.GENERAL;

  @ApiPropertyOptional({
    description:
      'Career the feedback is about. Required unless section is GENERAL, and must match an existing career.',
    format: 'uuid',
  })
  @ValidateIf(
    (dto: CreateFeedbackDto) =>
      dto.careerId !== undefined || dto.section !== FeedbackSection.GENERAL,
  )
  @IsUUID('all', {
    message: ({ value }) =>
      value === undefined
        ? 'careerId is required when section is not GENERAL'
        : 'careerId must be a UUID',
  })
  careerId?: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Contact email for follow-up. Stored, never logged.',
    maxLength: 254,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsEmail()
  @MaxLength(254)
  userEmail?: string;

  @ApiPropertyOptional({ enum: FeedbackPlatform, example: 'WEB' })
  @IsOptional()
  @IsEnum(FeedbackPlatform)
  platform?: FeedbackPlatform;
}
