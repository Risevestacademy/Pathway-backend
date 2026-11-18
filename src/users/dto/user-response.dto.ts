import { ApiProperty } from '@nestjs/swagger';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
  TargetLevel,
} from '../../generated/prisma/client';

export class UserSkillSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class FieldSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

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

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ enum: TargetLevel, nullable: true })
  careerStage: TargetLevel | null;

  @ApiProperty({ enum: EducationLevel, nullable: true })
  educationLevel: EducationLevel | null;

  @ApiProperty({ type: String, nullable: true })
  institution: string | null;

  @ApiProperty({ type: Number, nullable: true })
  yearFinished: number | null;

  @ApiProperty({ type: String, nullable: true })
  courseOfStudy: string | null;

  @ApiProperty({ enum: InternshipCount, nullable: true })
  internshipCount: InternshipCount | null;

  @ApiProperty({ enum: ExperienceYears, nullable: true })
  experienceYears: ExperienceYears | null;

  @ApiProperty({ type: [String] })
  learningGoals: string[];

  @ApiProperty({ type: String, nullable: true })
  weeklyTimeCommitment: string | null;

  @ApiProperty({ example: true })
  analyticsEnabled: boolean;

  @ApiProperty({ example: 120, description: 'Total XP earned' })
  totalXp: number;

  @ApiProperty({ example: 3, description: 'Current daily streak' })
  currentStreak: number;

  @ApiProperty({ type: [UserSkillSummaryDto] })
  skills: UserSkillSummaryDto[];

  @ApiProperty({ type: [FieldSummaryDto] })
  careerInterests: FieldSummaryDto[];
}
