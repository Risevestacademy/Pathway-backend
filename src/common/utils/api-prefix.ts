import { ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from '../../config';

export function apiPrefix(
  configService: ConfigService<EnvironmentVariables, true>,
): string {
  return `api/${configService.get('API_VERSION', { infer: true })}`;
}
