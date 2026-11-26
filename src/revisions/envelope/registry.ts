import type { ContentType, RevisionStrategy } from '../envelope/strategy.types';

/**
 * The registry of content types that have a strategy.
 *
 * A `ContentType` without an entry here is not revivable: creating a session
 * revision for it fails with `UNSUPPORTED_CONTENT_TYPE`, and it has no
 * position in the publish order.
 *
 * Adding a strategy: `registerStrategy(new MyStrategy())` in
 * `strategies/index.ts`, which is imported by the module.
 *
 * The map is intentionally a plain `Map`, not a NestJS provider. Strategies are
 * pure logic; the registry is a lookup; the publisher reads it. Making it a
 * NestJS injectable adds wiring for no benefit.
 */
const registry = new Map<ContentType, RevisionStrategy>();

/**
 * Register a strategy. Throws if the content type is already registered, so a
 * duplicate registration is caught at startup.
 */
export function registerStrategy(strategy: RevisionStrategy): void {
  if (registry.has(strategy.contentType)) {
    throw new Error(
      `Duplicate RevisionStrategy registration for contentType "${strategy.contentType}"`,
    );
  }
  registry.set(strategy.contentType, strategy);
}

/** Look up the strategy for a content type. Throws if not registered. */
export function getStrategy(contentType: ContentType): RevisionStrategy {
  const strategy = registry.get(contentType);
  if (!strategy) {
    throw new Error(
      `No RevisionStrategy registered for contentType "${contentType}"`,
    );
  }
  return strategy;
}

/** True if a strategy is registered for the content type. */
export function hasStrategy(contentType: ContentType): boolean {
  return registry.has(contentType);
}

/**
 * The set of content types that have a registered strategy. Used by the
 * publish orchestrator to validate that a strategy is publishable, and by the
 * conformance test to check against `PUBLISHABLE_CONTENT_TYPES`.
 */
export function registeredContentTypes(): ContentType[] {
  return Array.from(registry.keys());
}
