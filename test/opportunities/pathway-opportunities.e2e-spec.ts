import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { OpportunityVerification } from '../../src/generated/prisma/client';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  RegisteredUser,
  wireNotificationMock,
} from '../utils/auth';
import { CatalogFixture, cleanupCatalog, seedCatalog } from '../utils/catalog';

interface ListItem {
  id: string;
  status: string;
}

const DAY = 24 * 60 * 60 * 1000;

describe('GET /me/opportunities?scope=pathway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let userA: RegisteredUser;
  let userB: RegisteredUser;

  const marker = `e2e-pathway-opps-${Date.now()}`;
  const ids = {} as Record<
    | 'soon'
    | 'open'
    | 'rolling'
    | 'closed'
    | 'draft'
    | 'withdrawn'
    | 'otherCareer'
    | 'retiredCareer',
    string
  >;

  const listUrl = () => `${apiPrefix}/me/opportunities`;

  const list = (token: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get(listUrl())
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  const setActivePathway = (token: string, careerId: string) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${token}`)
      .send({ careerId })
      .expect(200);

  const createOpportunity = async (
    key: keyof typeof ids,
    data: {
      careerId: string;
      verification?: OpportunityVerification;
      deadline?: Date | null;
      deadlineUnknown?: boolean;
    },
  ) => {
    const opportunity = await prisma.opportunity.create({
      data: {
        title: `${key} ${marker}`,
        type: 'JOB',
        organisation: 'Acme',
        location: 'Remote',
        description: 'A listing',
        applyUrl: 'https://example.com/apply',
        verification: data.verification ?? OpportunityVerification.VERIFIED,
        deadline: data.deadline ?? null,
        deadlineUnknown: data.deadlineUnknown ?? false,
        careers: { create: { careerId: data.careerId } },
      },
    });
    ids[key] = opportunity.id;
  };

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
    const careerA = catalog.publishedCareerId;
    const careerB = catalog.secondPublishedCareerId;
    const now = Date.now();

    await createOpportunity('soon', {
      careerId: careerA,
      deadline: new Date(now + 3 * DAY),
    });
    await createOpportunity('open', {
      careerId: careerA,
      deadline: new Date(now + 30 * DAY),
    });
    await createOpportunity('rolling', {
      careerId: careerA,
      deadlineUnknown: true,
    });
    await createOpportunity('closed', {
      careerId: careerA,
      deadline: new Date(now - DAY),
    });
    await createOpportunity('draft', {
      careerId: careerA,
      verification: OpportunityVerification.DRAFT,
      deadline: new Date(now + 30 * DAY),
    });
    await createOpportunity('withdrawn', {
      careerId: careerA,
      verification: OpportunityVerification.WITHDRAWN,
      deadline: new Date(now + 30 * DAY),
    });
    await createOpportunity('otherCareer', {
      careerId: careerB,
      deadline: new Date(now + 10 * DAY),
    });

    await createOpportunity('retiredCareer', {
      careerId: catalog.retiredCareerId,
      deadline: new Date(now + 10 * DAY),
    });

    userA = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-a@test.com`,
    });
    userB = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-b@test.com`,
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.opportunity.deleteMany({
        where: { title: { contains: marker } },
      });
      await cleanupUsers(
        prisma,
        [userA?.id, userB?.id].filter((id): id is string => Boolean(id)),
      );
      if (catalog) await cleanupCatalog(prisma, catalog);
    }
    await app?.close();
  });

  it('returns [] for a user with no active pathway', async () => {
    const { body } = await list(userB.accessToken, { scope: 'pathway' }).expect(
      200,
    );

    expect(body).toEqual([]);
  });

  it("returns only the active career's visible listings, soonest first and rolling last", async () => {
    await setActivePathway(userA.accessToken, catalog.publishedCareerId);

    const { body } = await list(userA.accessToken, { scope: 'pathway' }).expect(
      200,
    );
    const items = body as ListItem[];

    expect(items.map((item) => item.id)).toEqual([
      ids.soon,
      ids.open,
      ids.rolling,
    ]);
    expect(items.map((item) => item.status)).toEqual([
      'CLOSING_SOON',
      'OPEN',
      'ROLLING',
    ]);
  });

  it('follows the user when they switch active pathway', async () => {
    await setActivePathway(userA.accessToken, catalog.secondPublishedCareerId);

    const { body } = await list(userA.accessToken, { scope: 'pathway' }).expect(
      200,
    );

    expect((body as ListItem[]).map((item) => item.id)).toEqual([
      ids.otherCareer,
    ]);
  });

  it('keeps listing a career that was retired while active', async () => {
    await prisma.userPathway.create({
      data: {
        userId: userB.id,
        careerId: catalog.retiredCareerId,
        isActive: true,
      },
    });

    const { body } = await list(userB.accessToken, { scope: 'pathway' }).expect(
      200,
    );

    expect((body as ListItem[]).map((item) => item.id)).toEqual([
      ids.retiredCareer,
    ]);
  });

  it.each([{}, { scope: 'saved' }, { scope: 'PATHWAY' }])(
    'returns 400 in the standard validation format for %j',
    async (query) => {
      const { body } = await list(userA.accessToken, query).expect(400);

      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.fields).toHaveProperty('scope');
    },
  );

  it('returns 400 for an unknown query parameter', async () => {
    await list(userA.accessToken, { scope: 'pathway', page: '2' }).expect(400);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .get(listUrl())
      .query({ scope: 'pathway' })
      .expect(401);
  });

  it('returns 401 with an invalid token', async () => {
    await list('not-a-token', { scope: 'pathway' }).expect(401);
  });
});
