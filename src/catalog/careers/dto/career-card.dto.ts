import { ApiProperty } from '@nestjs/swagger';
import { TargetLevel } from '../../../generated/prisma/client';

export class CareerCardDto {
  @ApiProperty({ description: 'Unique identifier of the career' })
  id: string;

  @ApiProperty({ description: 'URL-friendly slug for the career' })
  slug: string;

  @ApiProperty({ description: 'Title of the career' })
  title: string;

  @ApiProperty({ description: 'Short description shown on the card' })
  description: string;

  @ApiProperty({
    description: 'Icon key used by the list/card UI (e.g. "fe-icon")',
    nullable: true,
  })
  iconKey: string | null;

  @ApiProperty({
    description: 'Target audience levels for this career',
    enum: TargetLevel,
    isArray: true,
  })
  targetLevels: TargetLevel[];

  @ApiProperty({
    description: 'Number of pathway steps ("Topics" in the UI)',
    example: 113,
  })
  topicCount: number;

  @ApiProperty({
    description: 'Number of linked resources ("Projects" in the UI)',
    example: 30,
  })
  resourceCount: number;
}
