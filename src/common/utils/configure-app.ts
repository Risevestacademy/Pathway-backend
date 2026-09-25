import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { EnvironmentVariables } from '../../config';
import { apiPrefix } from './api-prefix';

export function configureApp(app: INestApplication): void {
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.use(cookieParser());
  app.setGlobalPrefix(apiPrefix(config), { exclude: ['health'] });
}
