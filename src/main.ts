import './instrument';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './common';
import { EnvironmentVariables } from './config';
import { setupSwagger } from './swagger/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureApp(app);

  const pinoLogger = app.get(PinoLogger);
  app.useLogger(pinoLogger);

  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

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
