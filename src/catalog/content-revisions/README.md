# Content Revisions: Plan Builder


The plan builder is the single source of truth for **what changes when a revision is published**. Publishing, submitting for review, and reviewing an approved revision all derive their behaviour from one computation, so the reviewer's diff, the readiness check, and the publish transaction can never disagree.

If you find yourself writing comparison logic for revisions anywhere else, stop. It belongs in `buildPlan` or a sibling in this directory. A second implementation will drift from the first, and the drift will be invisible until a reviewer approves something publish can't safely apply.

---

## Files

| File | Purpose | Allowed imports |
|---|---|---|
| `career-snapshot.types.ts` | Snapshot type definitions | Prisma enum types only |
| `career-snapshot.plan.ts` | `buildPlan` and helpers (pure) | `career-snapshot.types` only |
| `career-snapshot.plan.spec.ts` | Unit tests with plain objects | Test scope |
| `career-snapshot.consistency.ts` | `findSnapshotProblems`: structural checks within one snapshot (pure) | `career-snapshot.types` only |
| `admin-career-revisions.controller.ts` | HTTP wiring for saving a career's draft revision | Nest |
| `content-revisions.service.ts` | Loads live career and revision, calls `buildPlan`, formats the diff | Prisma, Nest |
| `content-revisions.controller.ts` | HTTP wiring for the diff endpoint | Nest |

`career-snapshot.plan.ts` must stay dependency-free. No `PrismaService`, no `ConfigService`, nothing from `@nestjs`. If you need one of those, the logic belongs in the service. This is what keeps the planner testable without mocks.

---

## The shape

```ts
buildPlan({
  liveCareer,        // LiveCareerForPlan: subset of the Career row with relations
  snapshot,          // CareerSnapshot: the proposed content
  baseVersion,       // revision.baseVersion
  stepLearnerCounts, // { [stepId]: number }: learners affected by each step
}): CareerPlan
```

`CareerPlan` contains:
- `baseVersion`: the version the revision was created against.
- `liveVersion`: the live career's current version.
- `stale`: `baseVersion !== liveVersion`.
- `operations`: every change publish would apply.
- `blockers`: reasons publish is unsafe.
- `counts`: pre-aggregated tallies.

### Operations

```ts
{
  kind: 'create' | 'update' | 'move' | 'delete' | 'link' | 'unlink',
  section: 'career' | 'pathway' | 'steps' | 'stepSkills' | 'stepResources' | 'skills' | 'outlook' | 'resources',
  entityId?: string,  // real id, or a temp id like 'new-1' for creates
  parentId?: string,  // for stepSkills and stepResources: the parent step id
  field?: string,     // for update: the field that changed
  before?: unknown,   // for update, move, delete, unlink
  after?: unknown,    // for create, update, move, link
}
```

Operations are listed section by section so the diff reads naturally. **That is not an execution order.** The publish engine sequences its own writes.

### Blockers

```ts
{
  code: 'MISSING_CAREER_FIELD' | 'NO_SKILLS' | 'NO_PATHWAY_STEPS' | 'STEP_HAS_PROGRESS',
  message: string,
  section: PlanSection,
  entityId?: string,
  entityTitle?: string,      // for STEP_HAS_PROGRESS
  learnersAffected?: number, // for STEP_HAS_PROGRESS
}
```

A blocker means the change will not be proposed. If a reviewer removes a step that has learners, the plan emits a `STEP_HAS_PROGRESS` blocker and **no delete operation** for that step.

**The invariant:** an entity appears either in `operations` (it will change) or in `blockers` (it won't), never both.

---

## How the plan is consumed

The plan is one computation with three consumers. Each consumer reads the same fields and reacts differently, but none of them re-derives any of it.

### Readiness (submit)

A revision can be submitted when `blockers` is empty. If any blocker is present, submission fails with the blocker list. Don't write a separate readiness function — the blockers are the readiness check.

Staleness is not part of submission. A stale revision can still be submitted; whether it can be approved is a review concern.

### Approval (review)

Approval is refused when `stale` is true. The reviewer is looking at a base that no longer exists, and approving it would overwrite whatever moved the base forward. Rejection is always allowed, including for stale revisions — the editor needs a path forward even when the base has moved.

### Application (publish)

Publishing is refused when either `stale` is true or `blockers` is non-empty. Both checks run before the transaction opens, so a stale or blocked revision fails without touching a single row. Then the plan's `operations` are applied inside one transaction, and the career's version is incremented.

The pre-checks are the safety mechanism. If `stale` or a blocker slips through to the transaction, a rollback mid-publish leaves the reviewer with an ambiguous state — did it publish or not? Pre-checks make failure deterministic: refused before any write.

---

## Applying operations

The plan describes **what** changes. The publish engine decides **how** to apply them, because some sections need careful sequencing that the plan doesn't try to encode.

### Career fields

Each `update` in section `career` names a field and carries `before` and `after`. Collect them into one `career.update`.

### Pathway

`create` means the career has no pathway yet: create the pathway row, then its steps. `update` changes the pathway's title or description. `delete` is rare but possible.

### Steps

- **`create`:** `entityId` is a temp id (`new-1`). Insert the row, then record the real id in a temp-id map for later operations.
- **`update`:** a changed field on an existing step.
- **`move`:** an existing step's order changed.
- **`delete`:** an existing step with no progress.

**Two-pass reorder.** `(pathwayId, order)` is unique, so moving steps one at a time fails when two steps swap positions. Do it in two passes inside the transaction:

```ts
// Pass 1: move every affected step (and every new step) to a temporary negative order
for (const op of stepMoves) {
  await tx.pathwayStep.update({ where: { id: op.entityId }, data: { order: -op.after } });
}
// Pass 2: set the final order
for (const op of stepMoves) {
  await tx.pathwayStep.update({ where: { id: op.entityId }, data: { order: op.after } });
}
```

New steps use the same trick: insert them at negative orders, then set their final orders in pass two.

### Step skills and step resources

`link` inserts the join row. `unlink` deletes it. Resolve temp ids before inserting:

```ts
const realParentId = tempMap.get(op.parentId) ?? op.parentId;
```

Resources are shared across careers, so `unlink` removes the join row only. Never delete the `Resource` row from a step-level unlink.

### Career skills

`link` inserts `CareerSkill`, `unlink` deletes it, and `update` with `field: 'importance'` changes the importance column.

### Outlook

`create`, `update` and `delete` only. No ordering.

### Resources

- **`create`:** insert the `Resource`, record its real id in the temp-id map.
- **`link`:** insert the `PathwayStepResource` join row.
- **`update`:** update the resource row.
- **`unlink`:** delete the join row only.

### Temp ids

```ts
function resolveId(id: string, map: Map<string, string>): string {
  return map.get(id) ?? id;
}
```

Resolve every temp id through the map before it reaches Prisma. Skipping this produces foreign key violations.

---

## Blockers are product rules, not schema rules

Postgres allows a career with no skills, a career with no steps, and deleting a step learners completed. The product doesn't. Blockers encode the rules the schema can't.

- **Add a blocker** when a reviewer must know before approving that the change won't ship, or when the alternative is silent data corruption.
- **Don't add a blocker** for single-field validation such as length limits. That belongs on the DTO.

Blockers are also not warnings. A warning lets publish proceed with a caveat; a blocker refuses. If the change can't be applied safely, it's a blocker. If it can be applied but the reviewer should think twice, that's a separate concept the plan doesn't currently support — introduce it deliberately if it becomes necessary, not by softening existing blockers.

---

## Stale: the base has moved

`stale: true` means someone published to this career after the revision was created. Publishing would overwrite that change.

Different consumers react to `stale` differently:

- **Diff:** report it in the response. Don't refuse.
- **Submit:** ignore it.
- **Review:** refuse approval, allow rejection.
- **Publish:** refuse.

The rule of thumb: any operation that **applies** a change to live data must refuse stale revisions. Any operation that only **reports** or **freezes** a revision can accept them. Use `plan.stale` and don't compare versions by hand.

The fix for a stale revision is a rebase — bringing the revision's base forward while surfacing conflicts. That's a separate function, not a mode of `buildPlan`.

---

## Anti-patterns

- **No comparison logic outside `buildPlan`.** Writing `if (live.title !== snapshot.title)` in a service or controller is the drift this design prevents. Extend the plan.
- **No second readiness check.** A "validate before submit" function duplicates `blockers`.
- **Don't apply operations conditionally.** If the plan says create, create. Conditional logic in publish reintroduces drift.
- **Don't skip the two-pass reorder.** It will fail the first time two steps swap adjacent orders.
- **Don't add Prisma or Nest imports to `career-snapshot.plan.ts`.** If you need `BadRequestException`, throw it in the service after reading `plan.blockers`.
- **Adding a field to `PlanOperation` is fine, but every consumer must handle it.** Publish and the diff UI both read operations. Don't add a generic `metadata` bag. It starts a pattern where every consumer needs a parser.

---

## Testing

- `career-snapshot.plan.spec.ts` uses plain objects and must stay fast. Database tests belong in e2e.
- Every branch of every planner needs coverage. One test per branch is enough.
- **New snapshot field:** add it to the field lists and write one "field changed" test.
- **New blocker:** write one test that triggers it and one happy path that doesn't.
- **New section:** add a `planXxx` function, call it from `buildPlan`, and write create, update and delete tests.
- **New operation kind:** update `computeCounts`, the publish engine, and the diff rendering. This is a breaking change for anything consuming the plan, including the reviewer UI.

---

## Adding a new relation to the plan

1. Extend `CareerSnapshot` in `career-snapshot.types.ts`.
2. Extend `LiveCareerForPlan` in `career-snapshot.plan.ts`.
3. Add a `planXxx` function and call it from `buildPlan`.
4. Include the relation in the service's Prisma query and map it to `LiveCareerForPlan`.

Don't add a planner for a relation the snapshot doesn't carry. If the reviewer can't propose a change to it, there's nothing to plan.

---

## Not in this version

- **Schema version migration.** `schemaVersion` is 1 today. When it changes, add an upgrade function and make the service refuse incompatible versions. Until then it's trusted on read.
- **Rebase.** A three-way merge between base, live, and proposed. It lives beside `buildPlan` in this directory as a separate function. It can reuse the per-section comparison structure but isn't a mode of `buildPlan`.
- **Step deletion with progress transfer.** `STEP_HAS_PROGRESS` is a hard blocker today. A transfer feature would turn it into a warning with an acknowledge flag. Not now.
- **Undo.** Publishing increments the version and has no reverse. Revision history is a separate concern.

---

## What the plan is not

- **Not the revision.** The revision is the proposal. The plan is what publish would do about it.
- **Not the diff.** The diff renders the plan. It's one consumer among three.
- **Not the snapshot.** The snapshot is the proposal. The plan is the operations derived from it.
- **Not field validation.** Shape and length checks are class-validator's job on the DTO. Blockers are product rules.

---

## Vocabulary

The diff response and its Swagger description must use these terms exactly: **plan, operations, blockers, stale, counts**. The frontend will call the diff "the plan", so the backend should too. Drift in vocabulary becomes drift in mental model.

---
