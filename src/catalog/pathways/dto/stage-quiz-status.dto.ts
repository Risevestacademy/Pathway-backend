import { ApiProperty } from '@nestjs/swagger';

export class StageQuizStatusNotTaken {
  @ApiProperty({ enum: ['NOT_TAKEN'] })
  status: 'NOT_TAKEN';
}

export class StageQuizScore {
  @ApiProperty()
  correct: number;

  @ApiProperty()
  total: number;
}

export class StageQuizStatusTaken {
  @ApiProperty({ enum: ['TAKEN'] })
  status: 'TAKEN';

  @ApiProperty({ type: StageQuizScore })
  score: StageQuizScore;
}
