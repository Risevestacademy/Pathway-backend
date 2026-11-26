import { registerStrategy } from '../envelope/registry';
import { CareerRevisionStrategy } from './career/career.strategy';
import { ResourceRevisionStrategy } from './resource/resource.strategy';

/**
 * Register every strategy. Called by the module bootstrap provider.
 *
 * Idempotent: if the module is instantiated more than once in a process
 * (e.g. across multiple `Test.createTestingModule` compilations in a single
 * e2e run, or hot-reload), the second and subsequent calls are no-ops. The
 * invariant that matters is "the registry has one strategy per content type
 * after bootstrap", not "registerStrategies is called exactly once".
 *
 * The `registerStrategy` function still throws on a duplicate registration
 * with a *different* instance, so a genuine bug (registering the same type
 * twice with different code) is still caught. This function's flag only
 * guards against re-running the same bootstrap.
 */
let registered = false;

export function registerStrategies(): void {
  if (registered) return;
  registered = true;
  registerStrategy(new CareerRevisionStrategy());
  registerStrategy(new ResourceRevisionStrategy());
}
