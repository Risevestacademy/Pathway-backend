import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class UpdateMySkillsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'The full list of skill IDs the user has. Replaces the existing set.',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  skillIds: string[];
}
