import { ApiProperty } from '@nestjs/swagger';
import {
  PathwayReadCareerDto,
  PathwayReadProgressDto,
  StepResourceDto,
  StepTaskDto,
} from '../../catalog/pathways';

export class DashboardTotalsDto {
  @ApiProperty()
  savedPathways: number;
  @ApiProperty()
  completedSteps: number;
  @ApiProperty()
  xp: number;
  @ApiProperty()
  badgesEarned: number;
  @ApiProperty({ description: 'Badges in the catalogue, earned or not.' })
  badgesTotal: number;
}

export class DashboardStreakDto {
  @ApiProperty({
    description: 'Consecutive UTC days ending today or yesterday.',
  })
  current: number;
  @ApiProperty()
  longest: number;
}

export class DashboardHeatmapDayDto {
  @ApiProperty({ example: '2026-11-14' })
  date: string;
  @ApiProperty()
  count: number;
}

export class DashboardHeatmapDto {
  @ApiProperty({ example: '2025-11-15' })
  from: string;
  @ApiProperty({ example: '2026-11-14' })
  to: string;
  @ApiProperty({
    type: [DashboardHeatmapDayDto],
    description:
      'One entry per UTC day in the window, days without activity included as zero.',
  })
  days: DashboardHeatmapDayDto[];
}

export class DashboardBadgeDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty({ type: String, nullable: true })
  iconKey: string | null;
  @ApiProperty()
  xpThreshold: number;
  @ApiProperty()
  awardedAt: Date;
}

export class DashboardGoalStepDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  order: number;
}

export class DashboardGoalsDto {
  @ApiProperty({ type: DashboardGoalStepDto, nullable: true })
  step: DashboardGoalStepDto | null;
  @ApiProperty({ type: [StepTaskDto] })
  tasks: StepTaskDto[];
  @ApiProperty({ type: [StepResourceDto] })
  resources: StepResourceDto[];
}

export class DashboardActivePathwayDto {
  @ApiProperty()
  pathwayId: string;
  @ApiProperty({ type: PathwayReadCareerDto })
  career: PathwayReadCareerDto;
  @ApiProperty({ type: PathwayReadProgressDto, nullable: true })
  progress: PathwayReadProgressDto | null;
}

export class DashboardDto {
  @ApiProperty({ type: DashboardTotalsDto })
  totals: DashboardTotalsDto;
  @ApiProperty({ type: DashboardStreakDto })
  streak: DashboardStreakDto;
  @ApiProperty({ type: DashboardHeatmapDto })
  heatmap: DashboardHeatmapDto;
  @ApiProperty({ type: [DashboardBadgeDto] })
  badges: DashboardBadgeDto[];
  @ApiProperty({
    type: DashboardActivePathwayDto,
    nullable: true,
    description:
      'Progress and next step come from the same stage-aware read as GET /pathways/:id. Null when no pathway is active.',
  })
  activePathway: DashboardActivePathwayDto | null;
  @ApiProperty({ type: DashboardGoalsDto })
  todaysGoals: DashboardGoalsDto;
}
