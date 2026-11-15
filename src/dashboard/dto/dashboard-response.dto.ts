import { ApiProperty } from '@nestjs/swagger';
import { PathwayStepStatus } from '../../generated/prisma/client';

export class DashboardTotalsDto {
  @ApiProperty({
    description:
      'Pathways the user has saved, for PUBLISHED or RETIRED careers.',
  })
  savedPathways: number;

  @ApiProperty({
    description:
      'Steps the user has marked COMPLETED, across every pathway. A lifetime ' +
      'counter, not scoped to the active pathway — see activePathway.progress.',
  })
  completedSteps: number;

  @ApiProperty({ description: 'Total XP from the activity ledger.' })
  xp: number;

  @ApiProperty() badgesEarned: number;
  @ApiProperty() badgesTotal: number;
}

export class DashboardStreakDto {
  @ApiProperty() current: number;
  @ApiProperty() longest: number;
}

export class DashboardWeekDayDto {
  @ApiProperty({ example: '2026-11-10' }) date: string;
  @ApiProperty({ example: true }) active: boolean;
}

export class DashboardWeekStripDto {
  @ApiProperty({
    type: [DashboardWeekDayDto],
    description: 'Monday to Sunday of the current week, UTC.',
  })
  days: DashboardWeekDayDto[];

  @ApiProperty({ description: 'Same value as streak.current.' })
  currentStreak: number;
}

export class DashboardHeatmapDayDto {
  @ApiProperty() date: string;
  @ApiProperty() count: number;
}

export class DashboardHeatmapDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty({ type: [DashboardHeatmapDayDto] })
  days: DashboardHeatmapDayDto[];
}

export class DashboardBadgeDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: String, nullable: true }) iconKey: string | null;
  @ApiProperty() xpThreshold: number;
  @ApiProperty({ type: Date }) awardedAt: Date;
}

export class DashboardPathwayCareerDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty() retired: boolean;
}

export class DashboardProgressDto {
  @ApiProperty() completed: number;
  @ApiProperty() total: number;
  @ApiProperty() percentage: number;
  @ApiProperty({ type: String, nullable: true }) nextStepId: string | null;
  @ApiProperty({ example: true }) selfReported: true;
}

export class DashboardActivePathwayDto {
  @ApiProperty() pathwayId: string;
  @ApiProperty({ type: DashboardPathwayCareerDto })
  career: DashboardPathwayCareerDto;
  @ApiProperty({ type: DashboardProgressDto }) progress: DashboardProgressDto;
}

export type DashboardGoalKind = 'STEP' | 'TASK' | 'RESOURCE' | 'CHECKLIST';

export class DashboardGoalDto {
  @ApiProperty({ enum: ['STEP', 'TASK', 'RESOURCE', 'CHECKLIST'] })
  kind: DashboardGoalKind;

  @ApiProperty() id: string;
  @ApiProperty() title: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'XP the goal is worth. Null for checklist items, which have no XP.',
  })
  xp: number | null;

  @ApiProperty() done: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Secondary line for the goal row. Task goal, resource URL, parent task ' +
      'title for a checklist item, or null for a step.',
  })
  goalDescription: string | null;
}

export class DashboardCurrentProjectStepDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() order: number;
  @ApiProperty({ enum: PathwayStepStatus }) status: PathwayStepStatus;
}

export class DashboardCurrentProjectDto {
  @ApiProperty() stageId: string;
  @ApiProperty() stageTitle: string;
  @ApiProperty({ type: String, nullable: true })
  stageDescription: string | null;
  @ApiProperty() stageOrder: number;
  @ApiProperty() completed: number;
  @ApiProperty() total: number;
  @ApiProperty({
    description: 'Stage completion: completed steps / total steps.',
  })
  percentage: number;

  @ApiProperty({
    type: [String],
    description:
      'Distinct skills across this stage’s steps. Rendered as the card’s tags.',
  })
  skills: string[];

  @ApiProperty({ type: [DashboardCurrentProjectStepDto] })
  steps: DashboardCurrentProjectStepDto[];
}

export class DashboardDto {
  @ApiProperty({ type: DashboardTotalsDto }) totals: DashboardTotalsDto;
  @ApiProperty({ type: DashboardStreakDto }) streak: DashboardStreakDto;
  @ApiProperty({ type: DashboardWeekStripDto })
  weekStrip: DashboardWeekStripDto;
  @ApiProperty({ type: DashboardHeatmapDto }) heatmap: DashboardHeatmapDto;
  @ApiProperty({ type: [DashboardBadgeDto] }) badges: DashboardBadgeDto[];
  @ApiProperty({ type: DashboardActivePathwayDto, nullable: true })
  activePathway: DashboardActivePathwayDto | null;
  @ApiProperty({ type: DashboardCurrentProjectDto, nullable: true })
  currentProject: DashboardCurrentProjectDto | null;
  @ApiProperty({ type: [DashboardGoalDto] }) goals: DashboardGoalDto[];
}
