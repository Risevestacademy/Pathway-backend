/**
 * Content revision strategy contract.
 *
 * One strategy per content type. A strategy knows four things about its type:
 * how to validate a snapshot, how to plan a diff against live state, how to
 * render that diff for a reviewer, and how to apply it. Everything else —
 * sessions, locking, staleness, publish orchestration, temp-ID rewriting —
 * lives in the generic envelope and is not the strategy's concern.
 *
 * See `README.md` and `ARCHITECTURE.md` before implementing a new strategy.
 * Copy `strategies/career/` as the reference. Every strategy MUST pass
 * `runStrategyConformanceTests`.
 */

import type { Prisma } from '../../generated/prisma/client';

// ─────────────────────────────────────────────────────────────────────
// Content type
// ─────────────────────────────────────────────────────────────────────

/**
 * The set of content types that can be revised.
 *
 * Adding a member requires:
 * 1. A Prisma enum value (`ContentType` in schema.prisma).
 * 2. A `RevisionStrategy` implementation.
 * 3. Registration in `strategies/registry.ts`.
 * 4. Addition to both `PUBLISH_ORDER_CREATE` and `PUBLISH_ORDER_UPDATE` in
 *    `envelope/publish-order.ts`, in the correct position.
 *
 * At publish time, an unregistered type throws
 * `UNKNOWN_CONTENT_TYPE_IN_PUBLISH`; a type not in the order arrays also
 * throws. Both are programming errors, not user errors.
 */
export type ContentType =
  | 'CAREER'
  | 'PATHWAY'
  | 'PATHWAY_STAGE'
  | 'PATHWAY_STEP'
  | 'PATHWAY_STEP_TASK'
  | 'RESOURCE'
  | 'SKILL'
  | 'OUTLOOK'
  | 'SOURCE'
  | 'STAGE_QUIZ'
  | 'QUIZ_QUESTION';
// The set above is aspirational. Only types with a registered strategy are
// usable. The union is the allowed set; the registry is the available set.

// ─────────────────────────────────────────────────────────────────────
// Entity references and temp IDs
// ─────────────────────────────────────────────────────────────────────

/**
 * A reference to a content root: which type, which ID.
 *
 * Used for publish events and for `nestedRootsTouched`. The ID may be a temp ID
 * (`new-*`) in a snapshot; it must be a real ID in a publish event.
 */
export interface ContentRef {
  contentType: ContentType;
  contentId: string;
}

/** A not-yet-created row. `new-1`, `new-2`, ... Scoped to a session. */
export type TempId = `new-${number}`;

export const isTempId = (id: string): id is TempId => /^new-\d+$/.test(id);

/**
 * A declared location in a strategy's snapshot where a temp ID may appear.
 *
 * - `path`: a dot-path in the snapshot object. Array elements use `[]`:
 *   `steps[].resourceIds[]` means "each element of `resourceIds` in each item
 *   of `steps`".
 * - `kind`: `scalar` for a single value at the path; `array` for an array of
 *   values at the path.
 *
 * The publisher uses this to rewrite temp IDs before applying. If a strategy
 * fails to declare a path where a temp ID can appear, that temp ID will not be
 * rewritten and the apply will fail with an FK error. The conformance suite
 * checks that declared paths exist in the snapshot type.
 *
 * Example for a step strategy:
 *   [
 *     { path: 'id', kind: 'scalar' },
 *     { path: 'resourceIds', kind: 'array' },
 *     { path: 'skillIds', kind: 'array' },
 *     { path: 'stageId', kind: 'scalar' },
 *   ]
 */
export interface TempIdField {
  path: string;
  kind: 'scalar' | 'array';
}

// ─────────────────────────────────────────────────────────────────────
// Plans and operations
// ─────────────────────────────────────────────────────────────────────

/**
 * The sections a diff can be grouped into. One per content-type concept.
 * The UI groups the session diff by section.
 */
export type PlanSection =
  | 'career'
  | 'pathway'
  | 'stages'
  | 'steps'
  | 'stepSkills'
  | 'stepResources'
  | 'skills'
  | 'outlook'
  | 'sources'
  | 'resources'
  | 'tasks'
  | 'quiz'
  | 'quizQuestions';

/**
 * A single proposed change. The strategy emits these from `plan`; the
 * strategy's `apply` consumes them; the strategy's `diff` renders them.
 *
 * `entityId` and `parentId` are whatever the strategy needs to locate the row
 * for apply. `before` and `after` are opaque to the envelope — only the
 * strategy interprets them.
 */
export interface PlanOperation {
  kind: 'create' | 'update' | 'move' | 'delete' | 'link' | 'unlink';
  section: PlanSection;
  entityId?: string;
  parentId?: string;
  field?: string;
  before?: unknown;
  after?: unknown;
  label?: string;
}

/**
 * A blocker prevents publish. A strategy's `plan` emits blockers for
 * conditions like "this step has learner progress" or "this resource is
 * required by a published step that cannot be unlinked".
 *
 * `code` is a stable machine identifier; the frontend maps it to a message.
 * Adding a new code is a strategy-local change; the envelope does not interpret
 * codes.
 */
export interface PlanBlocker {
  code: string;
  message: string;
  section: PlanSection;
  entityId?: string;
  entityTitle?: string;
  learnersAffected?: number;
}

/**
 * An advisory does not prevent publish. It informs the reviewer ("this
 * resource is used by 3 careers"). The envelope merges advisories into the
 * session diff.
 */
export interface PlanAdvisory {
  code: string;
  message: string;
  section: PlanSection;
  entityId?: string;
}

/**
 * The output of `plan`. `stale` is set by the strategy from its own staleness
 * rule; the envelope re-checks staleness at submit/publish using
 * `isRevisionStale`, so `stale` here is advisory for the diff only.
 */
export interface RevisionPlan {
  operations: PlanOperation[];
  blockers: PlanBlocker[];
  advisories: PlanAdvisory[];
  stale: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Diff rendering
// ─────────────────────────────────────────────────────────────────────

/** A single field change, as rendered for the reviewer. */
export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  beforeLabel?: string;
  afterLabel?: string;
}

/** A change to a single entity within a section. */
export interface EntityChange {
  entityId: string;
  entityTitle: string;
  changes: FieldChange[];
}

/** A created or deleted entity. */
export interface EntityRef {
  id: string;
  title: string;
}

/** A reordered entity. */
export interface MovedEntity {
  id: string;
  title: string;
  fromOrder: number;
  toOrder: number;
}

export interface DiffContext {
  revisionId: string;
  baseVersion: number;
  liveVersion: number;
  sessionId: string | null;
}

/**
 * One section of a diff, grouped by `section`. A session diff is an array of
 * these, one per section that has changes.
 */
export interface SectionChanges {
  section: PlanSection;
  contentType: ContentType;
  changed: EntityChange[];
  added: EntityRef[];
  removed: EntityRef[];
  moved: MovedEntity[];
}

// ─────────────────────────────────────────────────────────────────────
// Apply result
// ─────────────────────────────────────────────────────────────────────

/**
 * What `apply` returns to the publisher.
 *
 * `createdIds` MUST contain an entry for every row the strategy created in this
 * apply, keyed by the temp ID the client used. The publisher uses it to rewrite
 * temp IDs in subsequent revisions' snapshots. A missing entry means a
 * subsequent revision that references that temp ID will fail to apply with an
 * FK error.
 *
 * `realIdByTempId` is the same map, exposed for clarity in the response.
 */
export interface ApplyResult {
  createdIds: Map<string, string>;
}

// ─────────────────────────────────────────────────────────────────────
// The strategy interface
// ─────────────────────────────────────────────────────────────────────

/**
 * A revision strategy for one content type.
 *
 * All methods receive a Prisma transaction client (`tx`) where they touch the
 * DB, so the publisher's transaction boundary is respected. Methods that do
 * not touch the DB (`validate`, `diff`) do not receive `tx`.
 *
 * See `README.md` for the full workflow, and `ARCHITECTURE.md` for the
 * decisions behind this shape.
 */
export interface RevisionStrategy<TSnapshot = unknown> {
  /** The type this strategy handles. Matches a `ContentType` union member. */
  readonly contentType: ContentType;

  /** Human label for the content type ("Career", "Resource", ...). */
  readonly contentTypeLabel: string;

  /**
   * Structural validation of a snapshot. Returns a list of problems; empty
   * means the snapshot is well-formed. Called on draft save (as warnings) and
   * on submit (hard-fails if any problems exist).
   *
   * MUST be pure: no DB access, no side effects. Structural only — does not
   * check cross-entity existence (that is `plan`'s job).
   */
  validate(snapshot: TSnapshot): string[];

  /**
   * Load the current live row(s) for a content root, in the shape `plan`
   * expects. Returns `null` for a content root that does not yet exist (a new
   * model being created in this session).
   *
   * MUST use the provided `tx` so the publisher's locks and transaction are
   * respected.
   */
  loadLive(
    tx: Prisma.TransactionClient,
    contentId: string,
  ): Promise<unknown | null>;

  /**
   * Acquire a row lock on the content root's live row(s), so concurrent
   * revisions and publishes on the same root serialise. A no-op for a content
   * root that does not yet exist.
   *
   * MUST use the provided `tx`.
   *
   * Locking order: the publisher calls this per revision, before the revision
   * row is locked. Never lock a live row after locking a session.
   */
  lock(tx: Prisma.TransactionClient, contentId: string): Promise<void>;

  /**
   * Compare live state to a (validated) snapshot, and produce the plan:
   * operations to apply, blockers that prevent publish, advisories that
   * inform the reviewer.
   *
   * `baseVersion` is the version the revision was opened against; the strategy
   * may use it to decide whether to include a `stale` flag in the plan, but
   * the envelope re-checks staleness itself via `isRevisionStale`.
   *
   * MUST be pure: no DB access. All DB reads happen in `loadLive`. If the
   * strategy needs more than what `loadLive` returns (e.g. learner counts),
   * `loadLive` must fetch it into the returned live shape.
   */
  plan(
    live: unknown | null,
    snapshot: TSnapshot,
    baseVersion: number,
  ): RevisionPlan;

  /**
   * Render a plan for the reviewer. MUST be pure.
   *
   * The returned sections are merged with other revisions' sections in the
   * same session by the service. Use `fieldLabels` and `titleFor` to produce
   * human-readable output.
   *
   * The `ctx` argument carries session-scoped metadata the diff renderer may
   * need: the revision id (for logging / correlation), and the session's
   * current base and live versions (for the response envelope). Strategies
   * that don't need it can ignore the argument.
   *
   * Asynchronous because some strategies (e.g. career) resolve foreign-key
   * display labels via a Prisma query. The envelope awaits the result.
   */
  diff(
    plan: RevisionPlan,
    snapshot: TSnapshot,
    ctx: DiffContext,
  ): Promise<SectionChanges[]>;

  /**
   * Apply a plan to the live database inside the caller's transaction.
   *
   * MUST NOT commit or roll back — the publisher owns the transaction.
   *
   * MUST return `createdIds` for every row it created, keyed by the temp ID
   * the client used. See `ApplyResult`.
   *
   * MUST be safe for an empty plan (returns empty `createdIds`).
   *
   * `live` is the result of `loadLive`; `null` for a new model.
   */
  apply(
    tx: Prisma.TransactionClient,
    plan: RevisionPlan,
    live: unknown | null,
    contentId: string,
  ): Promise<ApplyResult>;

  /**
   * Staleness check. Called by the envelope at submit and publish.
   *
   * `baseVersion` is the revision's anchored version; `currentVersion` is the
   * envelope's computed `COUNT(*)` over publish events. A revision is stale
   * when `baseVersion < currentVersion`.
   *
   * Most strategies use the default (numeric comparison); override only if the
   * strategy has a genuinely different staleness notion (it should not).
   */
  isStale(baseVersion: number, currentVersion: number): boolean;

  /**
   * Paths in this strategy's snapshot where a temp ID (`new-*`) may appear.
   * Used by the publisher to rewrite snapshots before applying subsequent
   * revisions. See `TempIdField`.
   *
   * MUST be exhaustive. A missing path means a temp ID will not be rewritten
   * and a subsequent apply will fail. The conformance suite checks that the
   * declared paths exist in the snapshot type.
   */
  readonly tempIdFields: readonly TempIdField[];

  /**
   * Nested content roots whose rows this strategy's `apply` may write.
   *
   * For a strategy that owns exactly one root (the common case — a `RESOURCE`
   * strategy writes only the `Resource` row and its links), return `[]`.
   *
   * For a strategy that updates rows that are themselves content roots (e.g.
   * a `PATHWAY` strategy that changes step ordering, touching `PathwayStep`
   * rows), return the set of roots it will touch for a given plan. The
   * publisher writes a publish event for each, which bumps the version of each
   * and correctly makes open revisions against those roots stale.
   *
   * MUST be deterministic given the plan.
   */
  nestedRootsTouched(plan: RevisionPlan): ContentRef[];

  /**
   * Human-readable title for an entity of this content type, given its
   * snapshot-shaped value. Used by the diff renderer for `added` and `removed`
   * entries. Falls back to the entity ID if the snapshot has no obvious title
   * field (that fallback is a review smell — a content type should have a
   * title).
   */
  titleFor(entity: unknown): string;

  /**
   * The section label used in the session diff for this content type's
   * top-level section (e.g. "Pathway Steps" for `steps`).
   */
  readonly sectionLabel: string;

  /**
   * Field labels for the diff, keyed by field name. Used by `diff` to render
   * `label` on each `FieldChange`. A strategy with many fields can derive this
   * from its config.
   */
  readonly fieldLabels: Readonly<Record<string, string>>;
}

// ─────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * The default staleness check: a revision is stale when its anchored version
 * is less than the current version of its content root.
 *
 * Every strategy uses this unless it has a genuinely different notion of
 * staleness. The envelope calls it in `submit` and `publish`.
 */
export const isRevisionStale = (
  baseVersion: number,
  currentVersion: number,
): boolean => baseVersion < currentVersion;
