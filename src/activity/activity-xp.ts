import { ActivityType } from '../generated/prisma/client';

export const ACTIVITY_XP = {
  [ActivityType.STEP_COMPLETED]: 50,
  [ActivityType.TASK_COMPLETED]: 30,
  [ActivityType.QUIZ_PASSED]: 20,
  [ActivityType.RESOURCE_COMPLETED]: 10,
} as const satisfies Partial<Record<ActivityType, number>>;
