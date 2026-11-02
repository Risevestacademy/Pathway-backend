import { ApiProperty } from '@nestjs/swagger';
import { RevisionStatus } from '../../../generated/prisma/client';

export class SubmitRevisionResponseDto {
  @ApiProperty({ example: 'a3f2c1d4-0000-0000-0000-000000000000' })
  id!: string;

  @ApiProperty({ example: 'b7e2d1a9-0000-0000-0000-000000000000' })
  careerId!: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.IN_REVIEW })
  status!: RevisionStatus;

  @ApiProperty({
    example: 3,
    description: 'The live career version this revision was based on.',
  })
  baseVersion!: number;

  @ApiProperty({ example: '2026-10-30T12:00:00.000Z' })
  updatedAt!: Date;
}
