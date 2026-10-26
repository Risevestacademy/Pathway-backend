import { ApiProperty } from '@nestjs/swagger';
import { InviteResponseDto } from './invite-response.dto';

export class InviteListResponseDto {
  @ApiProperty({ type: [InviteResponseDto] })
  items: InviteResponseDto[];

  @ApiProperty({ example: 42, description: 'Total matching invites' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
