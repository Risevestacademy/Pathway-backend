import type { Prisma } from '../../../generated/prisma/client';
import type {
  ApplyResult,
  ContentRef,
  DiffContext,
  RevisionPlan,
  RevisionStrategy,
  SectionChanges,
  TempIdField,
} from '../../envelope/strategy.types';
import { isRevisionStale } from '../../envelope/strategy.types';
import { applySkillPlan } from './skill.apply';
import { SKILL_STRATEGY_FIELD_LABELS } from './skill.config';
import { findSnapshotProblems } from './skill.consistency';
import { skillDiffSections } from './skill.diff';
import { loadLiveSkill, lockSkill } from './skill.live';
import { buildSkillPlan } from './skill.plan';
import type { LiveSkillForPlan, SkillSnapshot } from './skill.types';

export class SkillRevisionStrategy implements RevisionStrategy<SkillSnapshot> {
  readonly contentType = 'SKILL' as const;
  readonly contentTypeLabel = 'Skill';
  readonly sectionLabel = 'Skills';
  readonly fieldLabels = SKILL_STRATEGY_FIELD_LABELS;
  readonly tempIdFields: readonly TempIdField[] = [];

  validate(snapshot: SkillSnapshot): string[] {
    return findSnapshotProblems(snapshot);
  }

  async loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<LiveSkillForPlan | null> {
    return loadLiveSkill(tx, contentId);
  }

  async lock(tx: Prisma.TransactionClient, contentId: string): Promise<void> {
    await lockSkill(tx, contentId);
  }

  plan(
    live: LiveSkillForPlan | null,
    snapshot: SkillSnapshot,
    _baseVersion: number,
  ): RevisionPlan {
    if (!live) {
      return {
        operations: [],
        blockers: [
          {
            code: 'SKILL_NOT_FOUND',
            message: 'Skill not found',
            section: 'skills',
          },
        ],
        advisories: [],
        stale: false,
      };
    }

    const built = buildSkillPlan({ live, snapshot });
    return {
      operations: built.operations,
      blockers: built.blockers,
      advisories: [],
      stale: false,
    };
  }

  async diff(
    plan: RevisionPlan,
    snapshot: SkillSnapshot,
    _ctx: DiffContext,
  ): Promise<SectionChanges[]> {
    return skillDiffSections(plan, snapshot);
  }

  async apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    _live: LiveSkillForPlan | null,
    contentId: string,
  ): Promise<ApplyResult> {
    return applySkillPlan(tx, plan, contentId);
  }

  isStale(baseVersion: number, currentVersion: number): boolean {
    return isRevisionStale(baseVersion, currentVersion);
  }

  titleFor(entity: unknown): string {
    if (!entity || typeof entity !== 'object') return 'Unknown';
    const name = (entity as Record<string, unknown>).name;
    return typeof name === 'string' && name.length > 0 ? name : 'Unknown';
  }

  nestedRootsTouched(_plan: RevisionPlan): ContentRef[] {
    return [];
  }
}
