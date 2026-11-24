import type { ContentType } from './strategy.types';

/**
 * The publish order for content types when the session's context row does not
 * exist yet (a new model is being created).
 *
 * Parents come before children, because a child's foreign key to its parent
 * requires the parent row to exist.
 *
 * Adding a content type: add it in the correct position here AND in
 * `PUBLISH_ORDER_UPDATE`. The conformance test `publish-order.spec.ts` checks
 * that the two arrays cover exactly the registered content types.
 *
 * See `README.md §Publish order` and `ARCHITECTURE.md ADR-5`.
 */
export const PUBLISH_ORDER_CREATE: readonly ContentType[] = [
  'CAREER',
  'PATHWAY',
  'PATHWAY_STAGE',
  'RESOURCE',
  'SKILL',
  'PATHWAY_STEP',
  'PATHWAY_STEP_TASK',
  'SOURCE',
  'OUTLOOK',
  'STAGE_QUIZ',
  'QUIZ_QUESTION',
] as const;

/**
 * The publish order for content types when the session's context row already
 * exists (updating an existing model).
 *
 * Leaves come before parents, so a leaf's foreign key target is present when
 * the parent's links to it are written. (In practice, for updates the parent
 * already exists, so order is less critical; the array is kept for symmetry
 * and to make the ordering intent explicit.)
 *
 * See `PUBLISH_ORDER_CREATE` for the rules on adding a content type.
 */
export const PUBLISH_ORDER_UPDATE: readonly ContentType[] = [
  'RESOURCE',
  'SKILL',
  'PATHWAY_STEP_TASK',
  'PATHWAY_STEP',
  'PATHWAY_STAGE',
  'PATHWAY',
  'CAREER',
  'SOURCE',
  'OUTLOOK',
  'STAGE_QUIZ',
  'QUIZ_QUESTION',
] as const;

/**
 * The set of content types that have a position in both arrays. Used by the
 * registry and by the publish orchestrator to validate that a strategy is
 * publishable.
 *
 * Adding a content type to only one array is a programming error, not a
 * user-facing one; the conformance test catches it.
 */
export const PUBLISHABLE_CONTENT_TYPES: readonly ContentType[] = Array.from(
  new Set([...PUBLISH_ORDER_CREATE, ...PUBLISH_ORDER_UPDATE]),
);

/**
 * Pick the right order for a session.
 *
 * @param isCreate - true when the session's context row does not yet exist.
 */
export const orderFor = (isCreate: boolean): readonly ContentType[] =>
  isCreate ? PUBLISH_ORDER_CREATE : PUBLISH_ORDER_UPDATE;
