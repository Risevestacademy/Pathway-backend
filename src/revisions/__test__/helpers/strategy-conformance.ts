import { describe, expect, it } from '@jest/globals';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  ContentType,
  RevisionPlan,
  RevisionStrategy,
  SectionChanges,
} from '../../envelope/strategy.types';
import type { TxMock } from './mocks';

// ─────────────────────────────────────────────────────────────────────
// The strategy contract, as executable tests.
//
// Every strategy MUST pass this suite. A strategy that fails here is
// broken, not the suite. The suite is intentionally generic: it asserts
// the invariants in `strategy.types.ts` and `README.md`, and leaves
// query shapes, field lists, and per-type edge cases to the strategy's
// own `*.spec.ts`.
//
// Mock-based, matching the rest of the test suite. The seed supplies a
// `makeTx()` and a `seedLive(tx, live)` hook; the suite never names a
// Prisma model.
//
// `DiffContext` no longer carries `prisma` (Phase C). If a future
// strategy needs DB access in `diff`, that is a deliberate amendment to
// the envelope, not something this suite should assume.
// ─────────────────────────────────────────────────────────────────────

/**
 * The per-strategy fixture the conformance suite needs.
 *
 * `TSnapshot` is the strategy's snapshot type (e.g. `CareerSnapshot`).
 * `TLive` is the strategy's live type (e.g. `LiveCareerForPlan`), which
 * is `unknown` in the envelope but concrete here so `plan(live, ...)`
 * type-checks without casts.
 */
export interface ConformanceSeed<TSnapshot, TLive> {
  /** A well-formed snapshot. `validate` must return `[]`. */
  validSnapshot(): TSnapshot;

  /**
   * A snapshot that `validate` must reject (non-empty problems array).
   * Make the malformation obvious — clear a required field, break a
   * structural invariant — so a failure message is readable.
   */
  invalidSnapshot(): TSnapshot;

  /**
   * The live shape corresponding to `validSnapshot()` — same field
   * values, so `plan(live, validSnapshot(), 0)` emits zero operations.
   */
  liveMatching(snapshot: TSnapshot): TLive;

  /**
   * A live shape that differs from `validSnapshot()` in one field the
   * strategy's config actually compares. The suite asserts `plan` emits
   * at least one `update` with `field === changedField`.
   */
  liveWithOneFieldChanged(snapshot: TSnapshot): {
    live: TLive;
    changedField: string;
  };

  /** The content ID passed to `loadLive`, `lock`, and `apply`. */
  readonly contentId: string;

  /** A fresh mock tx, from `makeTxMock()`. */
  makeTx(): TxMock;

  /**
   * Wire the mock's resolved value for `loadLive` so the strategy's
   * `loadLive(tx, contentId)` returns `live`. Each spec implements this
   * by setting the right model method's `mockResolvedValue`. The suite
   * never names the model.
   */
  seedLive(tx: TxMock, live: TLive | null): void;
}

/** Cast a `TxMock` to the strategy's `Prisma.TransactionClient` param. */
const asTx = (t: TxMock): Prisma.TransactionClient =>
  t as unknown as Prisma.TransactionClient;

export function runStrategyConformanceTests<TSnapshot, TLive>(options: {
  strategy: RevisionStrategy<TSnapshot>;
  seed: ConformanceSeed<TSnapshot, TLive>;
}): void {
  const { strategy, seed } = options;
  const expectedContentType: ContentType = strategy.contentType;

  describe(`${strategy.contentType} strategy conformance`, () => {
    // ── validate ───────────────────────────────────────────────────
    describe('validate', () => {
      it('accepts a well-formed snapshot', () => {
        expect(strategy.validate(seed.validSnapshot())).toEqual([]);
      });

      it('rejects a malformed snapshot', () => {
        expect(
          strategy.validate(seed.invalidSnapshot()).length,
        ).toBeGreaterThan(0);
      });
    });

    // ── plan ───────────────────────────────────────────────────────
    describe('plan', () => {
      it('emits no operations when snapshot matches live', () => {
        const snapshot = seed.validSnapshot();
        const live = seed.liveMatching(snapshot);
        const plan = strategy.plan(live, snapshot, 0);
        expect(plan.operations).toEqual([]);
      });

      it('is deterministic (same inputs → same output)', () => {
        const snapshot = seed.validSnapshot();
        const live = seed.liveMatching(snapshot);
        const a = strategy.plan(live, snapshot, 0);
        const b = strategy.plan(live, snapshot, 0);
        expect(a).toEqual(b);
      });

      it('emits an update operation for a changed field', () => {
        const snapshot = seed.validSnapshot();
        const { live, changedField } = seed.liveWithOneFieldChanged(snapshot);
        const plan = strategy.plan(live, snapshot, 0);
        expect(plan.operations).toContainEqual(
          expect.objectContaining({ kind: 'update', field: changedField }),
        );
      });

      it('marks stale when baseVersion < live.version', () => {
        // Only meaningful if the strategy's live shape carries a
        // `version`. For strategies that do, this asserts the plan's
        // `stale` flag. For those that do not, the strategy's own spec
        // covers it; we guard on the live object having a numeric
        // `version` property.
        const snapshot = seed.validSnapshot();
        const live = seed.liveMatching(snapshot);
        const version = (live as { version?: unknown }).version;
        if (typeof version !== 'number') return;
        const plan = strategy.plan(live, snapshot, version + 1);
        expect(plan.stale).toBe(false);
        const planOlder = strategy.plan(live, snapshot, version - 1);
        expect(planOlder.stale).toBe(true);
      });
    });

    // ── diff ───────────────────────────────────────────────────────
    describe('diff', () => {
      it('returns sections tagged with the strategy content type', async () => {
        const snapshot = seed.validSnapshot();
        const { live } = seed.liveWithOneFieldChanged(snapshot);
        const plan = strategy.plan(live, snapshot, 0);
        const sections = await strategy.diff(plan, snapshot, {
          revisionId: 'conformance-revision',
          baseVersion: 0,
          liveVersion: 0,
          sessionId: 'conformance-session',
        });
        expect(Array.isArray(sections)).toBe(true);
        for (const s of sections as SectionChanges[]) {
          expect(s.contentType).toBe(expectedContentType);
        }
      });

      it('renders at least as many changes as plan operations', async () => {
        const snapshot = seed.validSnapshot();
        const { live } = seed.liveWithOneFieldChanged(snapshot);
        const plan = strategy.plan(live, snapshot, 0);
        const sections = await strategy.diff(plan, snapshot, {
          revisionId: 'conformance-revision',
          baseVersion: 0,
          liveVersion: 0,
          sessionId: 'conformance-session',
        });
        const rendered = sections.reduce(
          (n, s) =>
            n +
            s.changed.length +
            s.added.length +
            s.removed.length +
            s.moved.length,
          0,
        );
        // A `move` op renders as one `moved`; an `update` as one
        // `changed`; `create`/`link` as one `added`; `delete`/`unlink`
        // as one `removed`. So the rendered count is ≥ op count for
        // every op kind this suite produces (which is one `update`).
        expect(rendered).toBeGreaterThanOrEqual(plan.operations.length);
      });
    });

    // ── apply + loadLive (mock-backed) ─────────────────────────────
    describe('apply + loadLive', () => {
      it('loadLive returns null when the mock has no row', async () => {
        const t = seed.makeTx();
        seed.seedLive(t, null);
        const result = await strategy.loadLive(asTx(t), seed.contentId);
        expect(result).toBeNull();
      });

      it('loadLive returns the seeded live shape', async () => {
        const t = seed.makeTx();
        const snapshot = seed.validSnapshot();
        const live = seed.liveMatching(snapshot);
        seed.seedLive(t, live);
        const result = await strategy.loadLive(asTx(t), seed.contentId);
        expect(result).toEqual(live);
      });

      it('apply on an empty plan makes no writes and returns empty createdIds', async () => {
        const t = seed.makeTx();
        const snapshot = seed.validSnapshot();
        const live = seed.liveMatching(snapshot);
        const plan: RevisionPlan = {
          operations: [],
          blockers: [],
          advisories: [],
          stale: false,
        };
        const result = await strategy.apply(
          asTx(t),
          plan,
          live,
          seed.contentId,
        );
        expect(result.createdIds.size).toBe(0);
      });

      it('lock resolves without throwing', async () => {
        const t = seed.makeTx();
        await expect(
          strategy.lock(asTx(t), seed.contentId),
        ).resolves.toBeUndefined();
      });
    });

    // ── isStale ────────────────────────────────────────────────────
    describe('isStale', () => {
      it('returns false when baseVersion === currentVersion', () => {
        expect(strategy.isStale(5, 5)).toBe(false);
      });

      it('returns true when baseVersion < currentVersion', () => {
        expect(strategy.isStale(4, 5)).toBe(true);
      });

      it('returns false when baseVersion > currentVersion (defensive)', () => {
        expect(strategy.isStale(6, 5)).toBe(false);
      });
    });

    // ── tempIdFields ───────────────────────────────────────────────
    describe('tempIdFields', () => {
      it('is an array (possibly empty)', () => {
        expect(Array.isArray(strategy.tempIdFields)).toBe(true);
      });

      it('every declared path resolves in a valid snapshot', () => {
        if (strategy.tempIdFields.length === 0) return;
        const snapshot = seed.validSnapshot();
        for (const field of strategy.tempIdFields) {
          const resolved = resolvePath(snapshot, field.path);
          expect(resolved).toBeDefined();
        }
      });
    });

    // ── nestedRootsTouched ────────────────────────────────────────
    describe('nestedRootsTouched', () => {
      it('returns an array of content refs (possibly empty)', () => {
        const snapshot = seed.validSnapshot();
        const live = seed.liveMatching(snapshot);
        const plan = strategy.plan(live, snapshot, 0);
        const roots = strategy.nestedRootsTouched(plan);
        expect(Array.isArray(roots)).toBe(true);
        for (const r of roots) {
          expect(typeof r.contentType).toBe('string');
          expect(typeof r.contentId).toBe('string');
        }
      });
    });

    // ── titleFor ───────────────────────────────────────────────────
    describe('titleFor', () => {
      it('returns a non-empty title for a valid snapshot', () => {
        const title = strategy.titleFor(seed.validSnapshot());
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
      });

      it('returns a non-empty fallback for a non-object input', () => {
        // Contract: `titleFor` never throws on garbage; it falls back.
        // The exact fallback string is strategy-local, so we only
        // assert it is a non-empty string.
        const title = strategy.titleFor(undefined);
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
      });
    });

    // ── fieldLabels ────────────────────────────────────────────────
    describe('fieldLabels', () => {
      it('is non-empty and every value is a non-empty string', () => {
        const labels = strategy.fieldLabels;
        expect(Object.keys(labels).length).toBeGreaterThan(0);
        for (const [, label] of Object.entries(labels)) {
          expect(typeof label).toBe('string');
          expect(label.length).toBeGreaterThan(0);
        }
      });
    });

    // ── contentType metadata ──────────────────────────────────────
    describe('metadata', () => {
      it('contentType is a non-empty string', () => {
        expect(typeof strategy.contentType).toBe('string');
        expect(strategy.contentType.length).toBeGreaterThan(0);
      });

      it('contentTypeLabel and sectionLabel are non-empty strings', () => {
        expect(strategy.contentTypeLabel.length).toBeGreaterThan(0);
        expect(strategy.sectionLabel.length).toBeGreaterThan(0);
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Path helper (mirrors the `rewriteTempIds` grammar: dot-separated,
// `[]` suffix for arrays)
// ─────────────────────────────────────────────────────────────────────

function resolvePath(obj: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    const isArray = segment.endsWith('[]');
    const key = isArray ? segment.slice(0, -2) : segment;
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
    if (isArray) {
      if (!Array.isArray(current)) return undefined;
      // Empty array is "resolved" for structural-path purposes.
    }
  }
  return current;
}
