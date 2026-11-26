import type { Skill } from '../../../generated/prisma/client';

export const SKILL_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SkillSnapshot = {
  schemaVersion: typeof SKILL_SNAPSHOT_SCHEMA_VERSION;
  name: string;
  description: string | null;
};

export type LiveSkillForPlan = Pick<Skill, 'id' | 'name' | 'description'>;
