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

describe('Saved careers list (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let userA: RegisteredUser;
  let userB: RegisteredUser;

  const marker = `e2e-saved-careers-${Date.now()}`;

  const list = (token: string) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/careers`)
      .set('Authorization', `Bearer ${token}`);

  const saveAt = (userId: string, careerId: string, savedAt: Date) =>
    prisma.userCareer.create({ data: { userId, careerId, savedAt } });

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
    await prisma.userPathway.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
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

  it('should return [] for a user with no saves', async () => {
    const response = await list(userA.accessToken).expect(200);

    expect(response.body).toEqual([]);
  });

  it('should list saved careers newest first with full card shape and flags', async () => {
    await saveAt(
      userA.id,
      catalog.publishedCareerId,
      new Date('2026-11-01T00:00:00.000Z'),
    );
    await saveAt(
      userA.id,
      catalog.secondPublishedCareerId,
      new Date('2026-11-02T00:00:00.000Z'),
    );
    await prisma.userPathway.create({
      data: {
        userId: userA.id,
        careerId: catalog.publishedCareerId,
        isActive: true,
      },
    });

    const response = await list(userA.accessToken).expect(200);
    const body = response.body as {
      id: string;
      slug: string;
      title: string;
      description: string;
      iconKey: string | null;
      targetLevels: string[];
      topicCount: number;
      resourceCount: number;
      savedAt: string;
      isActivePathway: boolean;
      isRetired: boolean;
    }[];

    expect(body.map((item) => item.id)).toEqual([
      catalog.secondPublishedCareerId,
      catalog.publishedCareerId,
    ]);

    // Confirm the DB values back the card shape, and the shape is exactly
    // the shared card contract + savedAt + flags (no shortDescription).
    const secondCareer = await prisma.career.findUniqueOrThrow({
      where: { id: catalog.secondPublishedCareerId },
      select: {
        slug: true,
        title: true,
        description: true,
        iconKey: true,
        targetLevels: true,
        _count: { select: { resources: true } },
        pathway: { select: { _count: { select: { steps: true } } } },
      },
    });

    expect(body[0]).toEqual({
      id: catalog.secondPublishedCareerId,
      slug: secondCareer.slug,
      title: secondCareer.title,
      description: secondCareer.description,
      iconKey: secondCareer.iconKey,
      targetLevels: secondCareer.targetLevels,
      topicCount: secondCareer.pathway?._count.steps ?? 0,
      resourceCount: secondCareer._count.resources,
      savedAt: '2026-11-02T00:00:00.000Z',
      isActivePathway: false,
      isRetired: false,
    });
    expect(body[0]).not.toHaveProperty('shortDescription');
    expect(body[1].isActivePathway).toBe(true);
  });

  it('should keep a retired career listed with isRetired', async () => {
    await saveAt(userA.id, catalog.retiredCareerId, new Date());

    const response = await list(userA.accessToken).expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: catalog.retiredCareerId,
        isRetired: true,
      }),
    ]);
  });

  it('should leave out a saved career that is a draft', async () => {
    await saveAt(userA.id, catalog.draftCareerId, new Date());

    const response = await list(userA.accessToken).expect(200);

    expect(response.body).toEqual([]);
  });

  it('should not flag a started but inactive pathway as active', async () => {
    await saveAt(userA.id, catalog.publishedCareerId, new Date());
    await prisma.userPathway.create({
      data: {
        userId: userA.id,
        careerId: catalog.publishedCareerId,
        isActive: false,
      },
    });

    const response = await list(userA.accessToken).expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ isActivePathway: false }),
    ]);
  });

  it("should never show one user's saves to another", async () => {
    await saveAt(userA.id, catalog.publishedCareerId, new Date());
    await prisma.userPathway.create({
      data: {
        userId: userB.id,
        careerId: catalog.publishedCareerId,
        isActive: true,
      },
    });

    const forB = await list(userB.accessToken).expect(200);
    const forA = await list(userA.accessToken).expect(200);

    expect(forB.body).toEqual([]);
    expect(forA.body).toEqual([
      expect.objectContaining({ isActivePathway: false }),
    ]);
  });

  it('should expose the same card shape as GET /careers', async () => {
    await saveAt(userA.id, catalog.publishedCareerId, new Date());

    const [saved] = (await list(userA.accessToken).expect(200)).body as {
      id: string;
      slug: string;
      title: string;
      description: string;
      iconKey: string | null;
      targetLevels: string[];
      topicCount: number;
      resourceCount: number;
      savedAt: string;
      isActivePathway: boolean;
      isRetired: boolean;
    }[];

    const explore = await request(app.getHttpServer())
      .get(`${apiPrefix}/careers`)
      .expect(200);

    // 5.2 will wrap `/careers` as `{ totals, items }`. This test is written
    // for the 5.1 intermediate shape `CareerCardDto[]`; the 5.2 PR updates
    // this line to `explore.body.items`.
    const exploreItems = (
      explore.body as {
        items: Array<Record<string, unknown>>;
      }
    ).items;
    const match = exploreItems.find((c) => c.id === saved.id);
    expect(match).toBeDefined();

    const {
      savedAt: _s,
      isActivePathway: _a,
      isRetired: _r,
      ...cardFromSaved
    } = saved;

    expect(match).toEqual(cardFromSaved);
  });

  it('should return 401 without a valid token', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/me/careers`)
      .expect(401);
    await list('not-a-token').expect(401);
  });
});
