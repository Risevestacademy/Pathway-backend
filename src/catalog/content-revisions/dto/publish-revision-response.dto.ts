import { ApiProperty } from '@nestjs/swagger';
import { CareerStatus, RevisionStatus } from '../../../generated/prisma/client';

export class PublishRevisionResponseDto {
  @ApiProperty({ example: 'a3f2c1d4-0000-0000-0000-000000000000' })
  revisionId!: string;

  @ApiProperty({ example: 'b7e2d1a9-0000-0000-0000-000000000000' })
  careerId!: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.PUBLISHED })
  revisionStatus!: RevisionStatus;

  @ApiProperty({ enum: CareerStatus, example: CareerStatus.PUBLISHED })
  careerStatus!: CareerStatus;

  @ApiProperty({
    example: 5,
    description: 'The new live version of the career after publish.',
  })
  newVersion!: number;

  @ApiProperty({ example: '2026-10-31T12:00:00.000Z' })
  publishedAt!: Date;
}
