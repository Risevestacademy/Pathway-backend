# Architecture Decision Records — Content Revisions

Short records of the decisions that shaped this module. Each is
context / decision / alternatives / consequences. If you want to change a
decision, propose an amendment here first.

## ADR-1: RevisionSession as the unit of workflow

**Context.** The old system had a career-centric revision. Extending it to
multiple content types either means (a) one revision per model, with the
editor making N HTTP calls and reviewers seeing N separate change sets, or
(b) keeping everything inside a career-shaped snapshot, which prevents
extending to non-career types.

**Decision.** Introduce a `RevisionSession` that groups one `ContentRevision`
per changed model. The session is the unit of workflow (draft, submit, review,
publish); the revision is the unit of storage (per-model, per-version,
per-strategy).

**Alternatives.** (i) Career-only revisions forever — fails the goal. (ii) Per-
model revisions with no grouping — reviewers see fragmented change sets, and
multi-model edits (add a step + a resource it uses) cannot be atomic.
(iii) Event sourcing — out of scope; changes how writes work across the whole
app.

**Consequences.** The session is one extra table and one layer of orchestration.
Publishing a session applies all its revisions in one transaction, so multi-model
edits are atomic. The frontend talks to sessions; strategies talk to models.

## ADR-2: Batch save with replace semantics

**Context.** How should draft saves work? Per-model (one call per model edited),
or batch (one call carrying every change)?

**Decision.** One batch endpoint per session. The payload is the complete set
of drafts; revisions not in the payload are deleted in the same transaction
(replace, not merge). Save never touches live tables.

**Alternatives.** (i) Per-model save — N round-trips, per-item error handling,
phantom revisions when the frontend forgets a delete. (ii) Merge semantics —
partial saves possible, but the frontend must track deletions, which is a real
bug source.

**Consequences.** The frontend's "Save" button serialises the whole working set.
Autosave debounces the same call. There is no separate delete-revision endpoint.
The mental model matches the editor: save means save this state.

## ADR-3: Publish-event count as versioning

**Context.** Staleness needs a per-root version. Options: `baseUpdatedAt`
timestamps on each model, a `version Int` column on each model, or a publish-
event log.

**Decision.** `ContentRevisionPublishEvent` is an append-only log of
`(contentType, contentId, publishedAt)`. Version = `COUNT(*)` per root.
PUBLISHED revisions are never deleted, which keeps the count monotonic.

**Alternatives.** (i) `baseUpdatedAt` — misses edits that touch a child row but
not the parent (editing a step doesn't bump the pathway's `updatedAt`).
(ii) `version Int` on every model — one migration per model, one column to
maintain per strategy.

**Consequences.** One extra table and one extra insert per publish. One
`COUNT(*)` per staleness check, mitigated by the index on
`(contentType, contentId)`. Adding a content type requires no schema change.

## ADR-4: Config-driven strategies, not a metadata engine

**Context.** Adding a content type or a field should be cheap. The dream is
"add a model, write no code." That requires a metadata engine (like Directus or
Payload), which is 2–4k lines of infrastructure to write, test, and debug, and
which still needs per-type hooks for cross-field and relational rules.

**Decision.** Per-type strategy classes, with a **config-driven** interior.
Field comparison, validation, and diff are driven by exported config objects;
cross-field and relational rules are small hooks. Adding a scalar field is a
config line; adding a model is a strategy file.

**Alternatives.** (i) Metadata engine — out of scope; the cost is high and the
per-type hooks still exist. (ii) Event sourcing — changes how writes work across
the whole app.

**Consequences.** Each strategy is 150–500 lines, config-driven. The career
strategy is the reference implementation. The conformance suite is the contract.

## ADR-5: Two publish orders

**Context.** For a create, parents must exist before children (a step's FK to
a pathway needs the pathway to exist). For an update, leaves should be applied
before parents so FK targets exist when links are written.

**Decision.** Two hardcoded arrays (`PUBLISH_ORDER_CREATE`,
`PUBLISH_ORDER_UPDATE`). The publisher picks based on whether the session's
context row exists.

**Alternatives.** (i) A single topological sort computed at runtime — correct
but harder to reason about and harder to debug. (ii) A per-strategy
`publishDependencies` declaration — accurate but over-engineered for a small,
stable DAG.

**Consequences.** Adding a content type means adding it to both arrays. Cycles
are a schema problem. The arrays are documented in the README.

## ADR-6: Temp IDs are session-scoped

**Context.** A new model needs an ID before the DB assigns one. Options: client
generates the real ID (UUIDv4) and sends it; server assigns and the client
waits; temp IDs scoped to the session.

**Decision.** Temp IDs (`new-<n>`). Scoped to the session. Each strategy
declares `tempIdFields`; each strategy's `apply` returns `createdIds`. The
publisher rewrites snapshots before applying.

**Alternatives.** (i) Client-generated UUIDs — workable but loses "this is a
draft" semantics and lets clients specify real IDs, which is a footgun.
(ii) Server assigns and the client waits — blocks the editor between "add" and
"the row exists," which is the per-model-save problem again.

**Consequences.** One generic rewrite function (`rewriteTempIds`) driven by
`tempIdFields`. The publisher returns `idMap` for the frontend to reconcile.

## ADR-7: The career aggregate excludes steps

**Context.** The old career snapshot contained steps, resources, skills,
outlook. Under the new design, should a `CAREER` revision include them, or should
each be its own root?

**Decision.** The `CAREER` revision owns only career-level fields. Pathway,
steps, resources, outlook are each their own root, edited in their own
revisions, grouped in the same session.

**Alternatives.** (i) Keep the career aggregate — keeps the old shape but
prevents per-model staleness and re-couples the design to career. (ii) Path
revision includes steps — moves the coupling one level down without solving it.

**Consequences.** The career editor is a session editor, not a career-snapshot
editor. The frontend submits changes per model. Cross-aggregate conflicts are
prevented by the publish-event version bump.

## ADR-8: The old module stays until proven

**Context.** The old career-centric system works and is tested. The new system
is a rewrite of the same workflow.

**Decision.** Do not delete `src/catalog/content-revisions/` in the foundation
ticket. Mark it deprecated. Delete it in a later ticket, after the new system
has been exercised in a real workflow.

**Alternatives.** (i) Delete immediately — loses the safety net while the new
system is young. (ii) Never delete — dead code accrues.

**Consequences.** Two modules coexist for one or two sprints. The deprecation
markers keep new code out. Deletion is its own ticket.

## ADR-9: Source is its own content root

**Context.** `OutlookData.sourceId` is a foreign key to `Source`. Editors
create and edit sources. Should a source be revisable independently, or only
as part of an outlook revision?

**Decision.** `SOURCE` is its own content root with its own strategy. Outlook
entries reference sources by real ID (no temp IDs for sources in v1).
`SOURCE` precedes `OUTLOOK` in both publish-order arrays.

**Alternatives.** (i) Embed source in the outlook snapshot — couples two
editable rows with different lifecycles (a source is often shared across
outlook entries, and editing its name should not require an outlook revision).
(ii) Temp IDs for sources, so a session can create a source and reference it
from an outlook in one draft — cleaner UX, but adds a cross-root dependency
the session design does not currently solve for one-to-many references (a
source can back multiple outlook rows, so a temp ID in one outlook's snapshot
would have to be resolved across all revisions that reference it). Deferred.

**Consequences.** Editing a source is a `SOURCE` revision. An editor who
creates a source and wants to use it in an outlook does two publishes, not
one. If this becomes a real friction point, a later ticket adds `sourceId` to
the outlook strategy's `tempIdFields` and to the publisher's rewrite (one line
each) and relaxes this ADR. Until then, the constraint is: sources must exist
before outlook entries reference them.