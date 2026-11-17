import { ApiProperty } from '@nestjs/swagger';

export class ResourceCompletionResponseDto {
  @ApiProperty()
  resourceId: string;

  @ApiProperty()
  completed: boolean;

  @ApiProperty({ type: Date, nullable: true })
  completedAt: Date | null;

  @ApiProperty({
    description: 'XP this request awarded. 0 on a repeat or an undo.',
  })
  xpAwarded: number;
}
