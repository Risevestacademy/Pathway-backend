import type { Prisma } from '../../../generated/prisma/client';
import type { LiveSkillForPlan } from './skill.types';

export async function loadLiveSkill(
  tx: Prisma.TransactionClient,
  skillId: string,
): Promise<LiveSkillForPlan | null> {
  return tx.skill.findUnique({ where: { id: skillId } });
}

export async function lockSkill(
  tx: Prisma.TransactionClient,
  skillId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Skill" WHERE "id" = ${skillId} FOR UPDATE`;
}
