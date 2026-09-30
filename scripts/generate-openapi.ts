import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { buildSwaggerDocument } from '../src/swagger/swagger.config';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildSwaggerDocument(app);

  const outputDir = path.resolve(process.cwd(), 'openapi');
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, 'current.json'),
    JSON.stringify(document, null, 2),
  );

  await app.close();
}

generate().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
