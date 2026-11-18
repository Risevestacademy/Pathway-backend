import { ActivityType } from '../generated/prisma/client';

export const TRACKED_ACTIVITY_TYPES: ActivityType[] = [
  ActivityType.STEP_COMPLETED,
  ActivityType.TASK_COMPLETED,
  ActivityType.QUIZ_PASSED,
  ActivityType.RESOURCE_COMPLETED,
];
