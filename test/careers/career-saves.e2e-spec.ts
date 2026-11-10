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

describe('Career saves (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let userA: RegisteredUser;
  let userB: RegisteredUser;

  const marker = `e2e-career-saves-${Date.now()}`;
  const unknownId = '00000000-0000-4000-8000-000000000000';

  const saveUrl = (id: string) => `${apiPrefix}/careers/${id}/save`;

  const save = (id: string, token: string) =>
    request(app.getHttpServer())
      .put(saveUrl(id))
      .set('Authorization', `Bearer ${token}`);

  const unsave = (id: string, token: string) =>
    request(app.getHttpServer())
      .delete(saveUrl(id))
      .set('Authorization', `Bearer ${token}`);

  const countSaves = (careerId: string, userId: string) =>
    prisma.userCareer.count({ where: { careerId, userId } });

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
    await app.init();

    wireNotificationMock();

    catalog = await seedCatalog(prisma, { suffix: marker });
    userA = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-a@test.com`,
    });
    userB = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-b@test.com`,
    });
  });

  afterEach(async () => {
    await prisma.userCareer.deleteMany({
      where: { careerId: { in: catalog.careerIds } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      await cleanupUsers(
        prisma,
        [userA?.id, userB?.id].filter((id): id is string => Boolean(id)),
      );
    }
    if (app) await app.close();
  });

  it('should save then unsave a published career', async () => {
    const id = catalog.publishedCareerId;

    await save(id, userA.accessToken).expect(200);
    expect(await countSaves(id, userA.id)).toBe(1);

    await unsave(id, userA.accessToken).expect(204);
    expect(await countSaves(id, userA.id)).toBe(0);
  });

  it('should leave one row and return the same savedAt when saved twice', async () => {
    const id = catalog.publishedCareerId;

    const first = await save(id, userA.accessToken).expect(200);
    const second = await save(id, userA.accessToken).expect(200);
    const row = await prisma.userCareer.findUniqueOrThrow({
      where: { userId_careerId: { userId: userA.id, careerId: id } },
    });

    expect(first.body).toEqual({
      careerId: id,
      savedAt: row.savedAt.toISOString(),
    });
    expect(second.body).toEqual(first.body);
    expect(await countSaves(id, userA.id)).toBe(1);
  });

  it('should leave one row when the same save arrives concurrently', async () => {
    const id = catalog.publishedCareerId;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => save(id, userA.accessToken)),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array(5).fill(200),
    );
    expect(await countSaves(id, userA.id)).toBe(1);
  });

  it('should never create or change a UserPathway', async () => {
    const id = catalog.publishedCareerId;

    await save(id, userA.accessToken).expect(200);
    await unsave(id, userA.accessToken).expect(204);

    expect(
      await prisma.userPathway.count({ where: { userId: userA.id } }),
    ).toBe(0);
  });

  it.each<[string, () => string]>([
    ['draft', () => catalog.draftCareerId],
    ['retired', () => catalog.retiredCareerId],
    ['unknown', () => unknownId],
  ])('should return 404 when newly saving a %s career', async (_label, id) => {
    const response = await save(id(), userA.accessToken).expect(404);

    expect((response.body as { error: string }).error).toBe('NOT_FOUND');
    expect(await countSaves(id(), userA.id)).toBe(0);
  });

  it('should keep a save, and accept a repeat save, once the career is retired', async () => {
    const id = catalog.secondPublishedCareerId;
    const first = await save(id, userA.accessToken).expect(200);
    await prisma.career.update({ where: { id }, data: { status: 'RETIRED' } });

    try {
      const second = await save(id, userA.accessToken).expect(200);
      expect(second.body).toEqual(first.body);

      await unsave(id, userA.accessToken).expect(204);
      expect(await countSaves(id, userA.id)).toBe(0);
    } finally {
      await prisma.career.update({
        where: { id },
        data: { status: 'PUBLISHED' },
      });
    }
  });

  it('should return 204 when removing a save that does not exist', async () => {
    await unsave(catalog.publishedCareerId, userA.accessToken).expect(204);
    await unsave(unknownId, userA.accessToken).expect(204);
  });

  it("should never change another user's save", async () => {
    const id = catalog.publishedCareerId;
    await save(id, userA.accessToken).expect(200);

    await unsave(id, userB.accessToken).expect(204);
    expect(await countSaves(id, userA.id)).toBe(1);

    await save(id, userB.accessToken).expect(200);
    await unsave(id, userA.accessToken).expect(204);
    expect(await countSaves(id, userB.id)).toBe(1);
  });

  it('should return 400 for a malformed id', async () => {
    await save('not-a-uuid', userA.accessToken).expect(400);
    await unsave('not-a-uuid', userA.accessToken).expect(400);
  });

  it('should return 401 without a valid token', async () => {
    const id = catalog.publishedCareerId;

    await request(app.getHttpServer()).put(saveUrl(id)).expect(401);
    await request(app.getHttpServer()).delete(saveUrl(id)).expect(401);
    await save(id, 'not-a-token').expect(401);
    await unsave(id, 'not-a-token').expect(401);
  });
});
