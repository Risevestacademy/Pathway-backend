import { ApiProperty } from '@nestjs/swagger';

export class CareerSkillDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}
