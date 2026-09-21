import './instrument';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { EnvironmentVariables } from './config';
import { setupSwagger } from './swagger/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.use(cookieParser());

  const pinoLogger = app.get(PinoLogger);
  app.useLogger(pinoLogger);

  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  const apiVersion = config.get('API_VERSION', { infer: true });

  app.setGlobalPrefix(`api/${apiVersion}`, {
    exclude: ['health'],
  });

  setupSwagger(app);

  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap().catch((error: unknown) => {
  new NestLogger('Bootstrap').error(
    'Application failed to start',
    error instanceof Error ? error.stack : String(error),
  );

  process.exit(1);
});
