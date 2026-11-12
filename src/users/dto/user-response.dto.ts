import { ApiProperty } from '@nestjs/swagger';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
  TargetLevel,
} from '../../generated/prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'USER' })
  role: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ada' })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Obi' })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Ada Obi' })
  fullName: string | null;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      'https://res.cloudinary.com/pathway/image/upload/v1/avatars/123e4567-e89b-12d3-a456-426614174000/photo.jpg',
  })
  avatarUrl: string | null;

  @ApiProperty({ enum: TargetLevel, nullable: true, example: null })
  careerStage: TargetLevel | null;

  @ApiProperty({ enum: EducationLevel, nullable: true, example: null })
  educationLevel: EducationLevel | null;

  @ApiProperty({ enum: InternshipCount, nullable: true, example: null })
  internshipCount: InternshipCount | null;

  @ApiProperty({ enum: ExperienceYears, nullable: true, example: null })
  experienceYears: ExperienceYears | null;

  @ApiProperty({ type: [String], example: [] })
  learningGoals: string[];

  @ApiProperty({ type: String, nullable: true, example: null })
  weeklyTimeCommitment: string | null;

  @ApiProperty({ type: [String], example: ['software-engineering'] })
  careerInterests: string[];

  @ApiProperty({ example: true })
  analyticsEnabled: boolean;
}
