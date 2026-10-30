import {
  type CareerSnapshot,
  type CareerSnapshotOutlook,
  type CareerSnapshotStep,
  isTempId,
} from './career-snapshot.types';
import { isRevisionStale } from './revision.rules';

// ─────────────────────────────────────────────────────────────────────
// Plan types
// ─────────────────────────────────────────────────────────────────────

export type OperationKind =
  'create' | 'update' | 'move' | 'delete' | 'link' | 'unlink';

export type PlanSection =
  | 'career'
  | 'pathway'
  | 'steps'
  | 'stepSkills'
  | 'stepResources'
  | 'skills'
  | 'outlook'
  | 'resources';

export interface PlanOperation {
  kind: OperationKind;
  section: PlanSection;
  entityId?: string;
  parentId?: string;
  field?: string;
  before?: unknown;
  after?: unknown;
  label?: string;
}

export type BlockerCode =
  | 'MISSING_CAREER_FIELD'
  | 'NO_SKILLS'
  | 'NO_PATHWAY_STEPS'
  | 'STEP_HAS_PROGRESS';

export interface PlanBlocker {
  code: BlockerCode;
  message: string;
  section: PlanSection;
  entityId?: string;
  entityTitle?: string;
  learnersAffected?: number;
}

export interface PlanCounts {
  added: number;
  changed: number;
  moved: number;
  removed: number;
  blockers: number;
}

export interface CareerPlan {
  baseVersion: number;
  liveVersion: number;
  stale: boolean;
  operations: PlanOperation[];
  blockers: PlanBlocker[];
  counts: PlanCounts;
}

export interface BuildPlanInput {
  liveCareer: LiveCareerForPlan;
  snapshot: CareerSnapshot;
  baseVersion: number;
  stepLearnerCounts?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────
// Live-shape input types (subset of Prisma's Career + relations)
// ─────────────────────────────────────────────────────────────────────

export interface LiveOutlook {
  id: string;
  type: string;
  geography: string;
  period: string;
  sourceId: string | null;
  median: { toString(): string } | null;
  percentile25: { toString(): string } | null;
  percentile75: { toString(): string } | null;
  currency: string | null;
  payPeriod: string | null;
  grossOrNet: string | null;
  experienceLevel: string | null;
  baseYear: number | null;
  baseValue: number | null;
  projectedYear: number | null;
  projectedValue: number | null;
  growthPercent: { toString(): string } | null;
  demandLevel: string | null;
}

export interface LiveStep {
  id: string;
  order: number;
  title: string;
  description: string | null;
  learningObjective: string;
  prerequisites: string | null;
  expectedActivity: string;
  skills: { skillId: string }[];
  resources: { resourceId: string }[];
}

export interface LiveCareerForPlan {
  id: string;
  version: number;
  title: string;
  slug: string;
  description: string;
  roleSummary: string | null;
  fieldId: string | null;
  targetLevels: string[];
  exampleActivities: string[];
  typicalEducationNote: string | null;
  certificationsNote: string | null;
  skills: { skillId: string; importance: string }[];
  outlook: LiveOutlook[];
  pathway: { id: string; title: string; description: string | null } | null;
  steps: LiveStep[];
  resources: LiveResource[];
}

export interface LiveResource {
  id: string;
  title: string;
  description: string | null;
  url: string;
  type: string;
  provider: string;
  costStatus: string;
  certificationCost: { toString(): string } | null;
  curationRationale: string;
  lastCheckedDate: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Career field comparison
// ─────────────────────────────────────────────────────────────────────

const CAREER_STRING_FIELDS = [
  'title',
  'slug',
  'description',
  'roleSummary',
  'fieldId',
  'typicalEducationNote',
  'certificationsNote',
] as const;

const CAREER_ARRAY_FIELDS = ['targetLevels', 'exampleActivities'] as const;

const REQUIRED_CAREER_FIELDS = [
  'title',
  'slug',
  'description',
  'roleSummary',
  'fieldId',
] as const;

const arraysEqual = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// ─────────────────────────────────────────────────────────────────────
// buildPlan
// ─────────────────────────────────────────────────────────────────────

export function buildPlan({
  liveCareer,
  snapshot,
  baseVersion,
  stepLearnerCounts = {},
}: BuildPlanInput): CareerPlan {
  const operations: PlanOperation[] = [];
  const blockers: PlanBlocker[] = [];

  planCareerFields(liveCareer, snapshot, operations, blockers);
  planPathway(liveCareer, snapshot, operations);
  planSkills(liveCareer, snapshot, operations, blockers);
  planResources(liveCareer, snapshot, operations);
  planOutlook(liveCareer, snapshot, operations);
  planSteps(liveCareer, snapshot, operations, blockers, stepLearnerCounts);

  return {
    baseVersion,
    liveVersion: liveCareer.version,
    stale: isRevisionStale(baseVersion, liveCareer.version),
    operations,
    blockers,
    counts: computeCounts(operations, blockers),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Section planners
// ─────────────────────────────────────────────────────────────────────

function planCareerFields(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  const s = snapshot.career;

  for (const field of REQUIRED_CAREER_FIELDS) {
    const value = s[field as keyof typeof s];
    if (value === null || value === undefined || value === '') {
      blockers.push({
        code: 'MISSING_CAREER_FIELD',
        message: `Career field "${field}" is required`,
        section: 'career',
        entityId: live.id,
      });
    }
  }

  for (const field of CAREER_STRING_FIELDS) {
    const before = live[field as keyof LiveCareerForPlan];
    const after = s[field as keyof typeof s];
    if (before !== after) {
      operations.push({
        kind: 'update',
        section: 'career',
        entityId: live.id,
        field,
        before,
        after,
      });
    }
  }

  for (const field of CAREER_ARRAY_FIELDS) {
    const before = live[field as keyof LiveCareerForPlan] as unknown[];
    const after = s[field as keyof typeof s] as unknown[];
    if (!arraysEqual(before, after)) {
      operations.push({
        kind: 'update',
        section: 'career',
        entityId: live.id,
        field,
        before,
        after,
      });
    }
  }
}

function planPathway(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
): void {
  const s = snapshot.pathway;
  const l = live.pathway;

  if (!s && !l) return;

  if (!l && s) {
    operations.push({
      kind: 'create',
      section: 'pathway',
      after: s,
    });
    return;
  }

  if (l && !s) {
    operations.push({
      kind: 'delete',
      section: 'pathway',
      entityId: l.id,
      before: l,
    });
    return;
  }

  if (l!.title !== s!.title) {
    operations.push({
      kind: 'update',
      section: 'pathway',
      entityId: l!.id,
      field: 'title',
      before: l!.title,
      after: s!.title,
    });
  }
  if (l!.description !== s!.description) {
    operations.push({
      kind: 'update',
      section: 'pathway',
      entityId: l!.id,
      field: 'description',
      before: l!.description,
      after: s!.description,
    });
  }
}

function planSkills(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): void {
  if (snapshot.skills.length === 0) {
    blockers.push({
      code: 'NO_SKILLS',
      message: 'Career must have at least one skill',
      section: 'skills',
    });
  }

  const liveSkills = new Map(live.skills.map((s) => [s.skillId, s.importance]));
  const snapSkills = new Map(
    snapshot.skills.map((s) => [s.skillId, s.importance]),
  );

  for (const [skillId, importance] of snapSkills) {
    const liveImportance = liveSkills.get(skillId);
    if (liveImportance === undefined) {
      operations.push({
        kind: 'link',
        section: 'skills',
        entityId: skillId,
        after: { skillId, importance },
      });
    } else if (liveImportance !== importance) {
      operations.push({
        kind: 'update',
        section: 'skills',
        entityId: skillId,
        field: 'importance',
        before: liveImportance,
        after: importance,
      });
    }
  }

  for (const skillId of liveSkills.keys()) {
    if (!snapSkills.has(skillId)) {
      operations.push({
        kind: 'unlink',
        section: 'skills',
        entityId: skillId,
        before: { skillId, importance: liveSkills.get(skillId) },
      });
    }
  }
}

function planResources(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
): void {
  const liveResources = new Map(live.resources.map((r) => [r.id, r]));
  const snapResources = new Map(
    snapshot.resources.filter((r) => !isTempId(r.id)).map((r) => [r.id, r]),
  );

  for (const [id, snap] of snapResources) {
    const l = liveResources.get(id);
    if (!l) {
      operations.push({
        kind: 'link',
        section: 'resources',
        entityId: id,
        after: snap,
      });
      continue;
    }
    if (
      l.title !== snap.title ||
      l.description !== snap.description ||
      l.url !== snap.url ||
      l.type !== snap.type ||
      l.provider !== snap.provider ||
      l.costStatus !== snap.costStatus ||
      l.curationRationale !== snap.curationRationale ||
      (l.certificationCost?.toString() ?? null) !== snap.certificationCost
    ) {
      operations.push({
        kind: 'update',
        section: 'resources',
        entityId: id,
        before: l,
        after: snap,
      });
    }
  }

  for (const id of liveResources.keys()) {
    if (!snapResources.has(id)) {
      operations.push({
        kind: 'unlink',
        section: 'resources',
        entityId: id,
        before: liveResources.get(id),
      });
    }
  }

  for (const snap of snapshot.resources) {
    if (isTempId(snap.id)) {
      operations.push({
        kind: 'create',
        section: 'resources',
        entityId: snap.id,
        after: snap,
      });
    }
  }
}

function planOutlook(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
): void {
  const liveById = new Map(live.outlook.map((o) => [o.id, o]));
  const snapById = new Map(
    snapshot.outlook.filter((o) => !isTempId(o.id)).map((o) => [o.id, o]),
  );

  for (const [id, snap] of snapById) {
    const l = liveById.get(id);
    if (!l) {
      operations.push({
        kind: 'create',
        section: 'outlook',
        entityId: id,
        after: snap,
      });
      continue;
    }
    const changes = outlookChanges(l, snap);
    if (changes.length > 0) {
      operations.push({
        kind: 'update',
        section: 'outlook',
        entityId: id,
        before: pickOutlook(l),
        after: pickOutlook(snap),
      });
    }
  }

  for (const id of liveById.keys()) {
    if (!snapById.has(id)) {
      operations.push({
        kind: 'delete',
        section: 'outlook',
        entityId: id,
        before: liveById.get(id),
      });
    }
  }

  for (const snap of snapshot.outlook) {
    if (isTempId(snap.id)) {
      operations.push({
        kind: 'create',
        section: 'outlook',
        entityId: snap.id,
        after: snap,
      });
    }
  }
}

const OUTLOOK_COMPARED_FIELDS: (keyof CareerSnapshotOutlook)[] = [
  'type',
  'geography',
  'period',
  'sourceId',
  'median',
  'percentile25',
  'percentile75',
  'currency',
  'payPeriod',
  'grossOrNet',
  'experienceLevel',
  'baseYear',
  'baseValue',
  'projectedYear',
  'projectedValue',
  'growthPercent',
  'demandLevel',
];

function outlookChanges(
  live: LiveOutlook,
  snap: CareerSnapshotOutlook,
): string[] {
  const changed: string[] = [];
  for (const field of OUTLOOK_COMPARED_FIELDS) {
    const liveValue = (live as unknown as Record<string, unknown>)[field];
    const snapValue = (snap as Record<string, unknown>)[field];
    const normalizedLive =
      liveValue && typeof liveValue === 'object' && 'toString' in liveValue
        ? (liveValue as { toString(): string }).toString()
        : liveValue;
    if (normalizedLive !== snapValue) changed.push(field);
  }
  return changed;
}

function pickOutlook(source: LiveOutlook | CareerSnapshotOutlook) {
  const out: Record<string, unknown> = {};
  for (const field of OUTLOOK_COMPARED_FIELDS) {
    const v = (source as Record<string, unknown>)[field];
    out[field] =
      v && typeof v === 'object' && 'toString' in v
        ? (v as { toString(): string }).toString()
        : v;
  }
  return out;
}

function planSteps(
  live: LiveCareerForPlan,
  snapshot: CareerSnapshot,
  operations: PlanOperation[],
  blockers: PlanBlocker[],
  learners: Record<string, number>,
): void {
  if (snapshot.steps.length === 0) {
    blockers.push({
      code: 'NO_PATHWAY_STEPS',
      message: 'Career must have at least one pathway step',
      section: 'steps',
    });
  }

  const liveById = new Map(live.steps.map((s) => [s.id, s]));
  const snapById = new Map(
    snapshot.steps.filter((s) => !isTempId(s.id)).map((s) => [s.id, s]),
  );

  for (const [id, snap] of snapById) {
    const l = liveById.get(id);
    if (!l) {
      operations.push({
        kind: 'create',
        section: 'steps',
        entityId: id,
        after: snap,
      });
      continue;
    }

    for (const field of [
      'title',
      'description',
      'learningObjective',
      'prerequisites',
      'expectedActivity',
    ] as const) {
      if (l[field] !== snap[field]) {
        operations.push({
          kind: 'update',
          section: 'steps',
          entityId: id,
          field,
          before: l[field],
          after: snap[field],
        });
      }
    }

    if (l.order !== snap.order) {
      operations.push({
        kind: 'move',
        section: 'steps',
        entityId: id,
        before: l.order,
        after: snap.order,
      });
    }

    planStepLinks(id, l, snap, operations);
  }

  for (const [id, l] of liveById) {
    if (snapById.has(id)) continue;
    const affected = learners[id] ?? 0;
    if (affected > 0) {
      blockers.push({
        code: 'STEP_HAS_PROGRESS',
        message: `Cannot remove step "${l.title}" — ${affected} learner${affected === 1 ? '' : 's'} affected`,
        section: 'steps',
        entityId: id,
        entityTitle: l.title,
        learnersAffected: affected,
      });
    } else {
      operations.push({
        kind: 'delete',
        section: 'steps',
        entityId: id,
        before: l,
      });
    }
  }

  for (const snap of snapshot.steps) {
    if (isTempId(snap.id)) {
      operations.push({
        kind: 'create',
        section: 'steps',
        entityId: snap.id,
        after: snap,
      });
      planStepLinks(snap.id, { skills: [], resources: [] }, snap, operations);
    }
  }
}

function planStepLinks(
  stepId: string,
  liveStep: {
    skills: { skillId: string }[];
    resources: { resourceId: string }[];
  },
  snapStep: CareerSnapshotStep,
  operations: PlanOperation[],
): void {
  const liveSkillIds = new Set(liveStep.skills.map((s) => s.skillId));
  const snapSkillIds = new Set(snapStep.skillIds);

  for (const skillId of snapSkillIds) {
    if (!liveSkillIds.has(skillId)) {
      operations.push({
        kind: 'link',
        section: 'stepSkills',
        entityId: skillId,
        parentId: stepId,
      });
    }
  }
  for (const skillId of liveSkillIds) {
    if (!snapSkillIds.has(skillId)) {
      operations.push({
        kind: 'unlink',
        section: 'stepSkills',
        entityId: skillId,
        parentId: stepId,
      });
    }
  }

  const liveResourceIds = new Set(liveStep.resources.map((r) => r.resourceId));
  const snapResourceIds = new Set(snapStep.resourceIds);

  for (const resourceId of snapResourceIds) {
    if (!liveResourceIds.has(resourceId)) {
      operations.push({
        kind: 'link',
        section: 'stepResources',
        entityId: resourceId,
        parentId: stepId,
      });
    }
  }
  for (const resourceId of liveResourceIds) {
    if (!snapResourceIds.has(resourceId)) {
      operations.push({
        kind: 'unlink',
        section: 'stepResources',
        entityId: resourceId,
        parentId: stepId,
      });
    }
  }
}

function computeCounts(
  operations: PlanOperation[],
  blockers: PlanBlocker[],
): PlanCounts {
  let added = 0;
  let changed = 0;
  let moved = 0;
  let removed = 0;

  for (const op of operations) {
    if (op.kind === 'create' || op.kind === 'link') added++;
    else if (op.kind === 'update') changed++;
    else if (op.kind === 'move') moved++;
    else if (op.kind === 'delete' || op.kind === 'unlink') removed++;
  }

  return { added, changed, moved, removed, blockers: blockers.length };
}
