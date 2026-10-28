import { ApiProperty } from '@nestjs/swagger';
import {
  CareerStatus,
  RevisionStatus,
  TargetLevel,
} from '../../../generated/prisma/client';

export class CareerDraftRevisionDto {
  @ApiProperty({ example: '0b7e4a1c-3d2f-4e8a-9b6c-5f1a2d3e4c7b' })
  id: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.DRAFT })
  status: RevisionStatus;

  @ApiProperty({ example: 1 })
  baseVersion: number;
}

export class CreateCareerResponseDto {
  @ApiProperty({ example: '9a4c2e1f-7b3d-4c5e-8f6a-1d2b3c4e5f6a' })
  id: string;

  @ApiProperty({ example: 'devops-engineer' })
  slug: string;

  @ApiProperty({ example: 'DevOps Engineer' })
  title: string;

  @ApiProperty({
    example: 'Automates how software is built, tested and deployed.',
  })
  description: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  roleSummary: string | null;

  @ApiProperty({ example: '6d1f3c2a-8b4e-4f7a-9c5d-2e1b0a9f8c7d' })
  fieldId: string;

  @ApiProperty({
    enum: TargetLevel,
    isArray: true,
    example: [TargetLevel.RECENT_GRAD],
  })
  targetLevels: TargetLevel[];

  @ApiProperty({ enum: CareerStatus, example: CareerStatus.DRAFT })
  status: CareerStatus;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: '2026-10-28T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: CareerDraftRevisionDto })
  revision: CareerDraftRevisionDto;
}
