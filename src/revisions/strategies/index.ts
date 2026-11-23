import { registerStrategy } from './registry';
import { CareerRevisionStrategy } from './career/career.strategy';

export function registerStrategies(): void {
  registerStrategy(new CareerRevisionStrategy());
}
