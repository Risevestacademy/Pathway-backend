import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

const swaggerConfig = new DocumentBuilder()
  .setTitle('Pathways API')
  .setDescription('API documentation for the Pathways backend')
  .setVersion('1.0')
  .build();

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, swaggerConfig);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('docs', app, document);
}
