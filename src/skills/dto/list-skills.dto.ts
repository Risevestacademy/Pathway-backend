import { ApiProperty } from '@nestjs/swagger';

export class SkillListItemDto {
  @ApiProperty({ description: 'Unique identifier of the skill' })
  id: string;

  @ApiProperty({ description: 'Name of the skill', example: 'TypeScript' })
  name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Short description of the skill',
  })
  description: string | null;
}
