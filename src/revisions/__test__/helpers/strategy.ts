import { jest } from '@jest/globals';
import type { ContentType } from '../../../generated/prisma/client';
import type { RevisionStrategy } from '../../envelope/strategy.types';
import { registerStrategy } from '../../envelope/registry';

/** Ergonomic cast for a jest.fn member of a fake strategy, so `.mock*` calls type-check. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const m = (fn: unknown): any => fn as any;

/** A fake strategy with every member the service touches. Override per test. */
export const makeFakeStrategy = (
  overrides: Partial<RevisionStrategy> & { contentType?: ContentType } = {},
): RevisionStrategy =>
  ({
    contentType: 'CAREER',
    contentTypeLabel: 'Career',
    validate: jest.fn(() => []),
    loadLive: jest.fn(async () => null),
    lock: jest.fn(async () => undefined),
    plan: jest.fn(() => ({
      operations: [],
      blockers: [],
      advisories: [],
      stale: false,
    })),
    diff: jest.fn(async () => []),
    apply: jest.fn(async () => ({ createdIds: new Map<string, string>() })),
    isStale: jest.fn((base: number, cur: number) => base < cur),
    tempIdFields: [],
    nestedRootsTouched: jest.fn(() => []),
    titleFor: jest.fn(() => 'Untitled'),
    sectionLabel: 'Career',
    fieldLabels: {},
    ...overrides,
  }) as RevisionStrategy;
/**
 * Reset a fake strategy's jest.fn() members to the defaults that
 * `makeFakeStrategy` establishes. Call this in beforeEach so each test starts
 * from a clean slate. Per-test overrides use `mockReturnValueOnce` etc.
 */
export const resetFakeStrategy = (fake: RevisionStrategy): void => {
  /** Ergonomic cast for a jest.fn member of a fake strategy, so `.mock*` calls type-check. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (fn: unknown): any => fn as any;
  m(fake.validate).mockReset().mockReturnValue([]);
  m(fake.loadLive).mockReset().mockResolvedValue(null);
  m(fake.lock).mockReset().mockResolvedValue(undefined);
  m(fake.plan).mockReset().mockReturnValue({
    operations: [],
    blockers: [],
    advisories: [],
    stale: false,
  });
  m(fake.diff).mockReset().mockResolvedValue([]);
  m(fake.apply).mockReset().mockResolvedValue({
    createdIds: new Map<string, string>(),
  });
  m(fake.isStale)
    .mockReset()
    .mockImplementation((base: number, cur: number) => base < cur);
  m(fake.nestedRootsTouched).mockReset().mockReturnValue([]);
  m(fake.titleFor).mockReset().mockReturnValue('Untitled');
  (fake as unknown as { tempIdFields: unknown[] }).tempIdFields = [];
};

/** One fake strategy per content type, registered once per test process. */
export const fakeCareerStrategy = makeFakeStrategy({ contentType: 'CAREER' });
export const fakeResourceStrategy = makeFakeStrategy({
  contentType: 'RESOURCE',
});

let registered = false;

/**
 * Register the shared fakes in the production registry. Idempotent across
 * Jest module reloads (the registry throws on duplicate registration).
 */
export const registerTestStrategies = (): void => {
  if (registered) return;
  for (const fake of [fakeCareerStrategy, fakeResourceStrategy]) {
    try {
      registerStrategy(fake);
    } catch {
      // already registered — fine
    }
  }
  registered = true;
};
