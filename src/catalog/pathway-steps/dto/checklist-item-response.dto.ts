import { ApiProperty } from '@nestjs/swagger';

export class ChecklistItemResponseDto {
  @ApiProperty()
  itemId: string;

  @ApiProperty()
  taskId: string;

  @ApiProperty()
  checked: boolean;

  @ApiProperty({ type: Date, nullable: true })
  checkedAt: Date | null;

  @ApiProperty()
  checklistChecked: number;

  @ApiProperty()
  checklistTotal: number;
}
