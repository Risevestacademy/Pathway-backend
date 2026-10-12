import { ApiProperty } from '@nestjs/swagger';

export class OptionDto {
  @ApiProperty({
    description: 'Enum value',
    example: 'BACHELOR',
  })
  value: string;

  @ApiProperty({
    description: 'Human-readable label for the enum value',
    example: "Bachelor's degree",
  })
  label: string;
}
