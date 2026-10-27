import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

const swaggerConfig = new DocumentBuilder()
  .setTitle('Pathways API')
  .setDescription(
    'API documentation for the Pathways backend.\n\nStaff routes state their minimum role in the operation description. A minimum role also admits every higher role (ADMIN > PUBLISHER > REVIEWER > EDITOR > USER). A route that also lists exact roles requires both checks to pass. A missing token returns 401; an insufficient or unknown role returns 403.',
  )
  .setVersion('1.0')
  .addBearerAuth({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token from POST /auth/login or POST /auth/verify-email.',
  })
  .build();

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, swaggerConfig);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('docs', app, document);
}
