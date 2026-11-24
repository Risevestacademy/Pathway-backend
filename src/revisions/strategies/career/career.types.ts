import type {
  Demand,
  OutlookType,
  ResourceCostStatus,
  ResourceType,
  SkillImportance,
  TargetLevel,
} from '../../../generated/prisma/client';
import type { PlanOperation, PlanBlocker } from '../../envelope/strategy.types';

// ─────────────────────────────────────────────────────────────────────
// Snapshot schema version
// ─────────────────────────────────────────────────────────────────────

export const CAREER_SNAPSHOT_SCHEMA_VERSION = 1 as const;

// ─────────────────────────────────────────────────────────────────────
// Snapshot types
// ─────────────────────────────────────────────────────────────────────

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
  id: string;
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
  id: string;
  order: number;
  title: string;
  description: string | null;
  learningObjective: string;
  prerequisites: string | null;
  expectedActivity: string;
  skillIds: string[];
  resourceIds: string[];
};

export type CareerSnapshotResource = {
  id: string;
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
// Live-shape types (subset of Prisma's Career + relations)
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

// ─────────────────────────────────────────────────────────────────────
// Plan input
// ─────────────────────────────────────────────────────────────────────

export interface CareerPlanInput {
  liveCareer: LiveCareerForPlan;
  snapshot: CareerSnapshot;
  baseVersion: number;
  stepLearnerCounts?: Record<string, number>;
}

// Re-export the envelope's plan types so callers can import from here
export type { PlanOperation, PlanBlocker };

export interface PlanCounts {
  added: number;
  changed: number;
  moved: number;
  removed: number;
  blockers: number;
}
