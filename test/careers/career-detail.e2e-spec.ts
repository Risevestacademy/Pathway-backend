import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  RegisteredUser,
  wireNotificationMock,
} from '../utils/auth';
import { CatalogFixture, cleanupCatalog, seedCatalog } from '../utils/catalog';

describe('Career detail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let user: RegisteredUser;

  const marker = `e2e-career-detail-${Date.now()}`;

  const detail = (id: string) =>
    request(app.getHttpServer()).get(`${apiPrefix}/careers/${id}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;
    prisma = app.get(PrismaService);
    await app.listen(0, '127.0.0.1');
    wireNotificationMock();

    catalog = await seedCatalog(prisma, { suffix: marker });
    // user kept for symmetry with other suites; endpoint is public
    user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}@test.com`,
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      if (user) await cleanupUsers(prisma, [user.id]);
    }
    if (app) await app.close();
  });

  it('returns overview, projection and requirements in one call', async () => {
    const res = await detail(catalog.publishedCareerId).expect(200);
    const body = res.body;

    expect(body.overview).toBeDefined();
    expect(body.overview.title).toBeTruthy();
    expect(body.overview.skills).toBeInstanceOf(Array);

    expect(body.projection).toBeInstanceOf(Array);
    if (body.projection.length > 0) {
      const first = body.projection[0];
      if (first.median !== null) expect(typeof first.median).toBe('string');
      if (first.growthPercent !== null)
        expect(typeof first.growthPercent).toBe('string');
    }

    expect(body.requirements).toEqual(
      expect.objectContaining({
        courses: expect.any(Array),
        certifications: expect.any(Array),
      }),
    );
  });

  it('never returns curationRationale or field', async () => {
    const res = await detail(catalog.publishedCareerId).expect(200);
    const json = JSON.stringify(res.body);

    expect(json).not.toMatch(/"curationRationale"/);
    expect(json).not.toMatch(/"fieldId"/);
    expect(res.body).not.toHaveProperty('field');
    expect(res.body.overview).not.toHaveProperty('field');
  });

  it('returns 404 for a draft career', async () => {
    await detail(catalog.draftCareerId).expect(404);
  });

  it('returns 404 for a retired career', async () => {
    await detail(catalog.retiredCareerId).expect(404);
  });

  it('returns 404 for an unknown UUID', async () => {
    await detail('00000000-0000-0000-0000-000000000000').expect(404);
  });

  it('returns 400 for a malformed UUID', async () => {
    await detail('not-a-uuid').expect(400);
  });
});
