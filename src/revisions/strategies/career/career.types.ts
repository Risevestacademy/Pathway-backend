// ─────────────────────────────────────────────────────────────────────
//
// Per README §"Aggregate boundaries" and ADR-7, the career aggregate owns
// ONLY career-level fields plus its own skill link-set. Pathway is its own
// content root (its strategy is a later ticket). Steps, resources, and
// outlook are likewise their own roots.
// ─────────────────────────────────────────────────────────────────────

import type {
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

export type CareerSnapshotSkill = {
  skillId: string;
  importance: SkillImportance;
};

export type CareerSnapshot = {
  schemaVersion: typeof CAREER_SNAPSHOT_SCHEMA_VERSION;
  career: CareerSnapshotCareer;
  skills: CareerSnapshotSkill[];
};

// ─────────────────────────────────────────────────────────────────────
// Live-shape types (subset of Prisma's Career + relations)
// ─────────────────────────────────────────────────────────────────────

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
}

// ─────────────────────────────────────────────────────────────────────
// Plan input
// ─────────────────────────────────────────────────────────────────────

export interface CareerPlanInput {
  liveCareer: LiveCareerForPlan;
  snapshot: CareerSnapshot;
  baseVersion: number;
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
