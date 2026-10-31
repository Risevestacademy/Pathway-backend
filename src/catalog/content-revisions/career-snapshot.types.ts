import type {
  Demand,
  OutlookType,
  ResourceCostStatus,
  ResourceType,
  SkillImportance,
  TargetLevel,
} from '../../generated/prisma/client';

// Bump only when the JSON shape changes incompatibly
export const CAREER_SNAPSHOT_SCHEMA_VERSION = 1 as const;

// A row not saved yet, e.g. "new-1"; replaced by a real id on publish
export type TempId = `new-${number}`;

export type EntityRef = string | TempId;

export const isTempId = (id: string): id is TempId => /^new-\d+$/.test(id);

export type CareerSnapshotCareer = {
  title: string;
  slug: string;
  description: string;
  roleSummary: string | null;
  fieldId: string | null;
  targetLevels: TargetLevel[];
  exampleActivities: string[];
  typicalEducationNote: string | null;
  certificationsNote: string | null;
};

export type CareerSnapshotOutlook = {
  id: EntityRef;
  type: OutlookType;
  geography: string;
  period: string;
  sourceId: string | null;
  median: string | null;
  percentile25: string | null;
  percentile75: string | null;
  currency: string | null;
  payPeriod: string | null;
  grossOrNet: string | null;
  experienceLevel: string | null;
  baseYear: number | null;
  baseValue: number | null;
  projectedYear: number | null;
  projectedValue: number | null;
  growthPercent: string | null;
  demandLevel: Demand | null;
};

export type CareerSnapshotSkill = {
  skillId: string;
  importance: SkillImportance;
};

export type CareerSnapshotPathway = {
  title: string;
  description: string | null;
};

export type CareerSnapshotStep = {
  id: EntityRef;
  order: number;
  title: string;
  description: string | null;
  learningObjective: string;
  prerequisites: string | null;
  expectedActivity: string;
  skillIds: string[];
  resourceIds: EntityRef[];
};

// A resource owned by this draft; shared resources are referenced by id only
export type CareerSnapshotResource = {
  id: EntityRef;
  title: string;
  description: string | null;
  url: string;
  type: ResourceType;
  provider: string;
  costStatus: ResourceCostStatus;
  certificationCost: string | null;
  curationRationale: string;
  lastCheckedDate: string;
};

// Content only; status, versions, review metadata and the career id live on the rows
export type CareerSnapshot = {
  schemaVersion: typeof CAREER_SNAPSHOT_SCHEMA_VERSION;
  career: CareerSnapshotCareer;
  pathway: CareerSnapshotPathway | null;
  steps: CareerSnapshotStep[];
  skills: CareerSnapshotSkill[];
  outlook: CareerSnapshotOutlook[];
  resources: CareerSnapshotResource[];
};

// ─────────────────────────────────────────────────────────────────────
// Plan types (moved from career-snapshot.plan.ts)
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
