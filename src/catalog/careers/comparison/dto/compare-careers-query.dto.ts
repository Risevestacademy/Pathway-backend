import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export const COMPARE_CAREERS_COUNT = 2;

const splitIds = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((id) => id.trim()) : value;

export class CompareCareersQueryDto {
  @ApiProperty({
    type: String,
    example:
      '5b1f3c2a-8d4e-4f6a-9b7c-1e2d3f4a5b6c,8c2d4e6f-1a3b-4c5d-9e7f-2a4b6c8d0e1f',
    description: 'Exactly two different career UUIDs, comma-separated',
  })
  @Transform(splitIds)
  @IsArray()
  @ArrayMinSize(COMPARE_CAREERS_COUNT)
  @ArrayMaxSize(COMPARE_CAREERS_COUNT)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}
