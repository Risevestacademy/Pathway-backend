import { ApiProperty } from '@nestjs/swagger';
import { RevisionStatus } from '../../../generated/prisma/client';

export class RecallRevisionResponseDto {
  @ApiProperty({ example: '0b7e4a1c-3d2f-4e8a-9b6c-5f1a2d3e4c7b' })
  id: string;

  @ApiProperty({ example: '9a4c2e1f-7b3d-4c5e-8f6a-1d2b3c4e5f6a' })
  careerId: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.DRAFT })
  status: RevisionStatus;

  @ApiProperty({ example: 3 })
  baseVersion: number;

  @ApiProperty({ example: '2026-10-30T14:00:00.000Z' })
  updatedAt: Date;
}
