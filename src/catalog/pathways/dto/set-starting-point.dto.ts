import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class SetStartingPointDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "UUID of a step in this career's pathway, or null to clear the starting point",
  })
  @ValidateIf((_dto, value) => value !== null)
  @IsUUID()
  stepId: string | null;
}
