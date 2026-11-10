import { ActivityType } from '../generated/prisma/client';

export const ACTIVITY_XP = {
  [ActivityType.STEP_COMPLETED]: 50,
} as const satisfies Partial<Record<ActivityType, number>>;
