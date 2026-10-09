import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TemplateRenderer } from '../src/notifications/template-renderer.service';
import { buildSwaggerDocument } from '../src/swagger/swagger.config';

async function generate() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    // Spec generation never sends email, so skip loading template files
    .overrideProvider(TemplateRenderer)
    .useValue({
      onModuleInit: () => undefined,
      render: () => {
        throw new Error(
          'Templates are not available during OpenAPI generation',
        );
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  await app.init();

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
