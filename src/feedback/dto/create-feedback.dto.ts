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
  FeedbackTargetType,
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
    enum: FeedbackTargetType,
    example: 'PATHWAY_STEP',
    description:
      'What the report is about. A certification is reported as CERTIFICATION. When omitted it is CAREER if only careerId is sent, otherwise OTHER.',
  })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsEnum(FeedbackTargetType)
  targetType?: FeedbackTargetType;

  @ApiPropertyOptional({
    description:
      'Id of the item named by targetType. Required unless targetType is OTHER, which needs none and ignores it. The item must exist and be visible.',
    format: 'uuid',
  })
  @ValidateIf(
    (dto: CreateFeedbackDto) =>
      dto.targetId !== undefined ||
      (dto.targetType !== undefined &&
        dto.targetType !== FeedbackTargetType.OTHER),
  )
  @IsUUID('all', {
    message: ({ value }) =>
      value === undefined
        ? 'targetId is required when targetType is not OTHER'
        : 'targetId must be a UUID',
  })
  targetId?: string;

  @ApiPropertyOptional({
    description:
      'Career the feedback is about. Without a targetType it is required unless section is GENERAL, and it is read as the target. With a targetType it is optional context, and must match an existing career.',
    format: 'uuid',
  })
  @ValidateIf(
    (dto: CreateFeedbackDto) =>
      dto.careerId !== undefined ||
      (dto.section !== FeedbackSection.GENERAL && dto.targetType === undefined),
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
