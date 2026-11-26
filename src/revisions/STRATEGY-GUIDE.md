# Strategy Guide — adding a content type to the revision system

This is the instruction manual for adding a
`RevisionStrategy`. Read `README.md` and `ARCHITECTURE.md` first. Copy
`strategies/career/` as the reference. Every strategy MUST pass
`runStrategyConformanceTests`.

If this guide and the code disagree, the code wins — update the guide.

---

## 1. What a strategy is

A strategy is one class per content type. It knows four things about its
type: how to validate a snapshot, how to plan a diff against live state,
how to render that diff for a reviewer, and how to apply it. Everything
else — sessions, locking, staleness, publish orchestration, temp-ID
rewriting — lives in the generic envelope and is not the strategy's
concern (ADR-1, ADR-4).

The interface is `RevisionStrategy<TSnapshot>` in
`src/revisions/envelope/strategy.types.ts`. The methods:

| Method | Pure? | Touches DB? | What it does |
|---|---|---|---|
| `validate(snapshot)` | yes | no | Structural problems only (duplicates, missing shape). Never checks FK existence. Returns `string[]`; empty = OK. |
| `loadLive(tx, contentId)` | no | yes (`tx`) | Load the live row(s) in the shape `plan` expects. `null` for a new root. MUST use `tx`. |
| `lock(tx, contentId)` | no | yes (`tx`) | Row-lock the live row so concurrent publishes serialise. No-op for a new root. |
| `plan(live, snapshot, baseVersion)` | yes | no | Compare live vs snapshot; emit `operations`, `blockers`, `advisories`, `stale`. MUST be pure — all DB reads happen in `loadLive`. |
| `diff(plan, snapshot, ctx)` | yes | no | Render the plan as `SectionChanges[]` for the reviewer. |
| `apply(tx, plan, live, contentId)` | no | yes (`tx`) | Write the plan. MUST NOT commit/rollback. MUST return `createdIds` (empty if none). |
| `isStale(base, current)` | yes | no | Default: `base < current`. Override only for a genuinely different notion. |
| `titleFor(entity)` | yes | no | Human title for a snapshot-shaped entity. Fall back to the entity id; a content type should have a title. |
| `tempIdFields` | — | — | Declared paths where a `new-*` id may appear. `[]` if the strategy creates no rows. |
| `nestedRootsTouched(plan)` | yes | no | Other content roots whose rows `apply` writes. `[]` if the strategy owns exactly one root. |
| `fieldLabels` | — | — | `field → label` map for the diff renderer. Derive from config via `labelsFrom`. |
| `contentType` / `contentTypeLabel` / `sectionLabel` | — | — | Metadata. `contentType` must be a member of the `ContentType` union. |

`validate` is **structural only**. It does not check that a `skillId`
exists — that is not its job. `plan` is pure and does not check either.
The first existence check is Prisma at `apply` time. See §9.

---

## 2. The three reference shapes

There is one existing strategy: `CAREER`. The other two shapes below are
described so you know which reference to copy when they land.

### RESOURCE — simple update-only (not yet built)

A content type that is a single row with scalar fields, no link-set, no
nested sub-entity. **Copy this if your type is "one row, a handful of
columns."** `RESOURCE` itself is the example: `name`, `url`,
`lastCheckedAt`. There is no create in a resource session (resources
pre-exist or are created via their own session), no ordering, no links.

Shape:
- `ResourceSnapshot = { schemaVersion, name, url, lastCheckedAt }`
- `LiveResourceForPlan = { id, version, name, url, lastCheckedAt }`
- Config: `RESOURCE_FIELD_CONFIG` — 3 scalar entries
- `plan` = `compareFields(RESOURCE_FIELD_CONFIG, …)`
- `apply` = `tx.resource.update({ where: { id }, data })`
- `tempIdFields = []`, `nestedRootsTouched = []`

### PATHWAY_STEP — update + reorder + link sets (not yet built)

A content type with ordered rows and many-to-many links. **Copy this if
your type has `order` and `skillIds[]` / `resourceIds[]`.** `PATHWAY_STEP`
is the example: it owns the step's fields, its `order` within a stage, and
its skill/resource links.

Shape:
- `PathwayStepSnapshot = { schemaVersion, step: { title, description, order, stageId, skillIds[], resourceIds[] } }`
- Config uses `kind: 'move'` for `order`, `kind: 'link-set'` for
  `skillIds` (skills pre-exist), `kind: 'temp-link-set'` for
  `resourceIds` (a resource may be created in the same session).
- `plan` = `compareFields` + `compareMove` + `compareLinkSet` (twice)
- `apply` writes the step row, then the join-table rows. It **returns
  `createdIds`** if the session can create a resource (`temp-link-set`).
- `tempIdFields = [{ path: 'resourceIds[]', kind: 'array' }]`
- `nestedRootsTouched` = `[]` for steps (the step's own root
  bump is enough). If a future pathway strategy reorders steps and bumps
  `PATHWAY_STEP` versions, *that* strategy declares the nested root, not
  this one.

### CAREER — single row + link-set (built; the reference)

A content type that is a single row plus a link-set. **Copy this if your
type has a parent row and a `(parentId, childId, payload)` join table.**
`CAREER` is the example: the `Career` row plus its `CareerSkill`
link-set, where `importance` is a payload on the link.

Shape:
- `CareerSnapshot = { schemaVersion, career: {…}, skills: [{ skillId, importance }] }`
- `LiveCareerForPlan = { id, version, …career, skills: [{ skillId, importance }] }`
- `CAREER_FIELD_CONFIG` — scalar + array entries for the row
- `planSkills` is hand-written (not config-driven) because `importance`
  makes the link-set comparison special: link / update-importance /
  unlink. Comment it well.
- `apply` writes the `Career` row (grouped fields in one `update`) and
  `careerSkill.create` / `.update` / `.delete`. `createdIds` is always
  empty (career creates no rows).
- `tempIdFields = []`, `nestedRootsTouched = []`

---

## 3. The config pattern

`FieldConfigEntry` (in `envelope/field-compare.ts`) drives `plan` and the
diff labels. Adding a scalar or array field is **one config line**, no
edits to `plan`, `apply`, or `diff` (ADR-4).

```ts
export const CAREER_FIELD_CONFIG: readonly FieldConfigEntry[] = [
  { field: 'title', kind: 'scalar', section: 'career', label: 'Title', required: true },
  { field: 'targetLevels', kind: 'array', section: 'career', label: 'Target Levels' },
  // …
] as const;
```

The `kind` set and its comparison semantics:

| `kind` | Comparison | Use for |
|---|---|---|
| `scalar` | `!==` | strings, booleans, nulls |
| `array` | element-wise `===` (**order-sensitive**) | `string[]` columns |
| `decimal` | normalize both sides via `.toString()`, then `!==` | Prisma `Decimal`, enum-like columns with runtime type drift |
| `move` | emit a `move` op with `before`/`after` order | `order Int` columns |
| `link-set` | set comparison; IDs must be real | many-to-many where the child pre-exists |
| `temp-link-set` | set comparison; `new-*` allowed on the snapshot side | many-to-many where the child can be created in the same session |

`compareFields(config, live, snapshot, entityId, ops)` handles
scalar/array/decimal. `compareMove` and `compareLinkSet` are separate
helpers for `move` and `link-set`/`temp-link-set`. The config interpreter
skips `move`/`link-set`/`temp-link-set` entries in `compareFields`; you
call the specific helper for those.

`labelsFrom(...configs)` builds the `field → label` map the diff
renderer reads. The strategy exposes it as `fieldLabels`.

**The `fieldId` rule.** A config field named `fieldId` is an FK. It is
compared as a `scalar` (string), not as a link. It is in the config, so
editing it emits an `update` op. It is **not** in `tempIdFields`
(`tempIdFields` is for rows the strategy creates, not for FKs it points
at).

### Order-sensitive arrays — the footgun

`arraysEqual` is element-wise: `["A","B"]` ≠ `["B","A"]`. Snapshots MUST
preserve the DB's array order for `kind: 'array'` fields, or `plan`
emits a spurious `update`. This bit the career E2E once. If a field is
genuinely set-valued, either (a) sort both sides before comparing (add a
`kind` for it), or (b) document that the editor must preserve order.

---

## 4. The conformance suite

```ts
import { runStrategyConformanceTests } from '../../__test__/helpers/strategy-conformance';

const seed: ConformanceSeed<ResourceSnapshot, LiveResourceForPlan> = {
  contentId: 'resource-1',
  validSnapshot: () => ({ /* well-formed */ }),
  invalidSnapshot: () => ({ /* malformed in an obvious way */ }),
  liveMatching: (s) => ({ /* same field values as s */ }),
  liveWithOneFieldChanged: (s) => ({ live: { /* … */ }, changedField: 'name' }),
  makeTx: () => makeTxMock(),
  seedLive: (t, live) => { t.resource.findUnique.mockResolvedValue(live); },
};

runStrategyConformanceTests({ strategy: new ResourceRevisionStrategy(), seed });
```

The `ConformanceSeed` shape is in
`src/revisions/__test__/helpers/strategy-conformance.ts`. Notes:

- `makeTx()` returns a `TxMock` from `makeTxMock()`. The suite is
  mock-based, matching the rest of the test suite. There is no real DB,
  no `$rollback`.
- `seedLive(tx, live)` wires the mock's resolved value. The suite never
  names a Prisma model.
- `invalidSnapshot()` must make `validate` return non-empty. For career
  that is duplicate `skillId`s (because `validate` only checks
  duplicates). If your `validate` checks more, your `invalidSnapshot`
  only needs to trip one of them.
- `liveWithOneFieldChanged` must mutate a field the config actually
  compares. Mutating an ignored field is a test bug, not a strategy bug.

### The 13 tests and what each asserts

| # | Test | Asserts |
|---|---|---|
| 1 | validate: accepts valid | `validate(validSnapshot())` is `[]` |
| 2 | validate: rejects invalid | `validate(invalidSnapshot()).length > 0` |
| 3 | plan: no ops on match | `plan(liveMatching(s), s, 0).operations` is `[]` |
| 4 | plan: deterministic | same inputs → equal plans |
| 5 | plan: changed field → update | the plan contains an `update` with `field === changedField` |
| 6 | plan: stale flag | if live has a numeric `version`, `baseVersion < version` sets `stale: true` |
| 7 | diff: content type tag | every `SectionChanges.contentType` === `strategy.contentType` |
| 8 | diff: covers plan | rendered change count ≥ plan op count |
| 9 | loadLive: null | `loadLive` with seeded null returns `null` |
| 10 | loadLive: returns live | `loadLive` returns the seeded shape |
| 11 | apply: empty plan | `apply` on empty plan makes no writes, `createdIds.size === 0` |
| 12 | lock: resolves | `lock` resolves without throwing |
| 13 | isStale / tempIdFields / nestedRootsTouched / titleFor / fieldLabels / metadata | the shape invariants |

**If a conformance test fails, the strategy is wrong, not the suite.**
The suite is the contract. Do not weaken it to make a strategy pass.
If you believe the contract itself is wrong, propose an envelope
amendment (see `ARCHITECTURE.md` ADR governance) — do not edit the suite
locally.

---

## 5. The temp-ID contract

Temp IDs (`new-<n>`) are the client-side IDs for rows not yet created.
The publisher rewrites them across the session before applying, driven by
each strategy's `tempIdFields`.

```ts
readonly tempIdFields: readonly TempIdField[] = [
  { path: 'resourceIds[]', kind: 'array' },  // each element of the array
  { path: 'id', kind: 'scalar' },            // a single value
  { path: 'steps[].id', kind: 'scalar' },    // each step's id
];
```

Grammar: dot-separated; `[]` suffix means "each element of this array."
A missing path means a temp ID will not be rewritten and a subsequent
apply will FK-fail. **Declare exhaustively.**

`apply` MUST return `createdIds: Map<tempId, realId>` for every row it
creates. A missing entry means a later revision that references that
temp ID fails to apply. Career returns an empty map (it creates nothing).
A step strategy that creates a resource in the same session returns the
resource's `new-<n> → uuid` mapping.

**`link-set` vs `temp-link-set`.** Use `link-set` when the child rows
always pre-exist (skills, fields). Use `temp-link-set` when a child can
be created in the same session (resources a step uses). The only
difference at plan time is that `temp-link-set` allows `new-*` on the
snapshot side; the publisher's rewrite does the rest. An `unlink` for a
temp ID is nonsense — `compareLinkSet` only emits `link` for temp IDs.

---

## 6. The `nestedRootsTouched` contract

If a strategy's `apply` writes rows that are themselves content roots
(rows with their own `ContentRevisionPublishEvent` history), it MUST
declare them:

```ts
nestedRootsTouched(plan: RevisionPlan): ContentRef[] {
  // e.g. a PATHWAY strategy that reorders steps touches each
  // reordered PATHWAY_STEP's version:
  return plan.operations
    .filter((op) => op.kind === 'move' && op.section === 'steps')
    .map((op) => ({ contentType: 'PATHWAY_STEP' as const, contentId: op.entityId! }));
}
```

The publisher writes a publish event for each returned ref, which bumps
that root's `currentVersion`, which makes any open revision against that
root stale. This is **the cross-aggregate staleness mechanism.** Without
it, reordering steps would not invalidate a concurrent open step revision.

T0.5 strategies return `[]` because they own exactly one root and the
publisher's own publish event bumps it. `CAREER` returns `[]` explicitly
with a comment saying so.

---

## 7. The advisories contract

An advisory is a soft warning the reviewer sees. It does not block
publish. `PlanAdvisory`:

```ts
interface PlanAdvisory {
  code: string;         // stable machine id, e.g. 'SHARED_RESOURCE'
  message: string;      // shown to the reviewer
  section: PlanSection;
  entityId?: string;
}
```

The example is `SHARED_RESOURCE` on a `RESOURCE` revision that updates
a row used by N careers: the diff includes an advisory "used by N
careers." Publish does not block; it is informational. Career emits no
advisories (T0.5).

Blockers (`PlanBlocker`) are the hard version — a blocker fails submit
with `400 PLAN_BLOCKED`. Use `blockers` for "this cannot proceed" (a
removed step with learner progress; a career with no skills); use
`advisories` for "the reviewer should know" (a shared resource).

---

### Required per-strategy specs (beyond conformance)

The conformance suite is the floor. It does not know your query shape or
your apply calls. Write:

- `loadLive` query shape — `toHaveBeenCalledWith({ where: { id }, include: { … } })`
- `apply` write calls — exact `tx.<model>.<method>` args for each op kind
- `plan` edge cases — required-field blocker, no-op on match, ordering
- `diff` rendering — a representative change renders as expected

Career's `career.live.spec.ts` and `career.apply.spec.ts` are the models.

---

## 8. What `validate` does *not* do (and why)

`validate` is structural. It does not check that `fieldId` /
`skillId` / `sourceId` / `stageId` exist. That is deliberate:
`validate` runs on draft save (as warnings) and submit (as hard fails),
and neither has a `tx`. `plan` is pure and also does not check. The
first existence check is **Prisma at `apply` time**, which surfaces as a
FK error inside the publish transaction — the transaction rolls back and
the session stays `APPROVED`.

That is acceptable for IDs the UI picks from a list (skills, fields).
It is **not** acceptable for IDs the user can type. If your strategy has
a typed FK, fetch the valid set in `loadLive` and emit a `plan` blocker
for an unknown ID. Do **not** add DB reads to `validate`.

This is the most common surprise during E2E: a placeholder `skillId`
passes validate, plan, submit, and review, then fails at publish with a
Prisma FK error. It is working as designed. Your E2E must use real UUIDs
from the DB.

---

## 9. Governance

If you believe this guide, `strategy.types.ts`, or the conformance suite
is wrong, **propose an amendment**, do not silently diverge. The
mechanism is: a comment block at the top of the affected file, a line in
the PR body, and (for ADRs) an amendment entry in `ARCHITECTURE.md`.