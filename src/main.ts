import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.use(cookieParser());

  const pinoLogger = app.get(PinoLogger);
  app.useLogger(pinoLogger);

  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pathways API')
    .setDescription('API documentation for the Pathways backend')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document);

  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap().catch((error: unknown) => {
  new NestLogger('Bootstrap').error(
    'Application failed to start',
    error instanceof Error ? error.stack : String(error),
  );

  process.exit(1);
});
