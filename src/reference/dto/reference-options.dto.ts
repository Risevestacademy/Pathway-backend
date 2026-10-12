import { ApiProperty } from '@nestjs/swagger';
import { OptionDto } from './option.dto';
import { SkillListItemDto } from '../../skills/dto/list-skills.dto';
import { FieldListItemDto } from '../../fields/dto/list-fields.dto';

export class ReferenceOptionsDto {
  @ApiProperty({ type: [OptionDto] })
  educationLevels: OptionDto[];

  @ApiProperty({ type: [OptionDto] })
  internshipOptions: OptionDto[];

  @ApiProperty({ type: [OptionDto] })
  experienceOptions: OptionDto[];

  @ApiProperty({ type: [SkillListItemDto] })
  skills: SkillListItemDto[];

  @ApiProperty({ type: [FieldListItemDto] })
  fields: FieldListItemDto[];
}
