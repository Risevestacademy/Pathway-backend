import { ApiProperty } from '@nestjs/swagger';
import { RevisionStatus } from '../../../generated/prisma/client';

export class RebaseRevisionResponseDto {
  @ApiProperty({ example: 'a3f2c1d4-0000-0000-0000-000000000000' })
  id!: string;

  @ApiProperty({ example: 'b7e2d1a9-0000-0000-0000-000000000000' })
  careerId!: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.DRAFT })
  status!: RevisionStatus;

  @ApiProperty({
    example: 4,
    description: 'The live career version this revision is now anchored to.',
  })
  baseVersion!: number;

  @ApiProperty({ example: '2026-10-30T12:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    example: 4,
    description: 'Current live career version at the time of the call.',
  })
  liveVersion!: number;

  @ApiProperty({
    example: true,
    description:
      'True if baseVersion was moved. False if the draft was already fresh (no write, no event).',
  })
  rebased!: boolean;
}
