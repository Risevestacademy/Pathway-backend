import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import {
  OutlookType,
  SkillImportance,
} from '../../src/generated/prisma/client';
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

describe('Career comparison (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let user: RegisteredUser;
  let skillId: string;

  const marker = `e2e-career-compare-${Date.now()}`;
  const unknownId = '00000000-0000-4000-8000-000000000000';

  const compare = (ids: string) =>
    request(app.getHttpServer()).get(`${apiPrefix}/careers/compare`).query({
      ids,
    });

  const salary = (careerId: string, currency: string) => ({
    careerId,
    type: OutlookType.SALARY,
    geography: 'Lagos, Nigeria',
    period: 'Q2 2025',
    median: '4500000',
    currency,
    payPeriod: 'year',
    experienceLevel: 'entry-level',
  });

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
    user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}@test.com`,
    });

    const skill = await prisma.skill.create({
      data: { name: `E2E Skill ${marker}` },
    });
    skillId = skill.id;

    await prisma.careerSkill.create({
      data: {
        careerId: catalog.publishedCareerId,
        skillId,
        importance: SkillImportance.REQUIRED,
      },
    });
    await prisma.userSkill.create({ data: { userId: user.id, skillId } });
    await prisma.outlookData.createMany({
      data: [
        salary(catalog.publishedCareerId, 'NGN'),
        salary(catalog.secondPublishedCareerId, 'USD'),
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (catalog) await cleanupCatalog(prisma, catalog);
      if (user) await cleanupUsers(prisma, [user.id]);
      if (skillId)
        await prisma.skill.delete({ where: { id: skillId } }).catch(() => {});
    }
    if (app) await app.close();
  });

  it('returns both published careers in the order of ids, with no skillMatch for anonymous callers', async () => {
    const ids = [catalog.secondPublishedCareerId, catalog.publishedCareerId];

    const res = await compare(ids.join(',')).expect(200);

    expect(res.body.careers.map(({ id }: { id: string }) => id)).toEqual(ids);
    expect(
      res.body.careers.map(
        ({ skillMatch }: { skillMatch: unknown }) => skillMatch,
      ),
    ).toEqual([null, null]);
    expect(res.body.careers[0].pathway).toEqual({
      stepCount: 3,
      stageCount: 2,
      firstStep: { id: expect.any(String), title: 'Step 1' },
    });
    expect(res.body.outlook).toEqual({
      salary: { comparable: false, reasons: ['CURRENCY'] },
      demand: { comparable: false, reasons: ['MISSING_VALUE'] },
    });
  });

  it('adds skillMatch for a signed-in caller', async () => {
    const res = await compare(
      `${catalog.publishedCareerId},${catalog.secondPublishedCareerId}`,
    )
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.careers[0].skillMatch).toEqual({
      matchedRequiredSkills: [{ id: skillId, name: `E2E Skill ${marker}` }],
      requiredSkillCount: 1,
      percentage: 100,
      niceToHaveSkills: [],
    });
    expect(res.body.careers[1].skillMatch).toEqual({
      matchedRequiredSkills: [],
      requiredSkillCount: 0,
      percentage: null,
      niceToHaveSkills: [],
    });
  });

  it('returns 401 for an invalid token', async () => {
    await compare(
      `${catalog.publishedCareerId},${catalog.secondPublishedCareerId}`,
    )
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
  });

  it.each([
    ['one id', () => catalog.publishedCareerId],
    [
      'three ids',
      () =>
        [
          catalog.publishedCareerId,
          catalog.secondPublishedCareerId,
          catalog.draftCareerId,
        ].join(','),
    ],
    [
      'the same id twice',
      () => `${catalog.publishedCareerId},${catalog.publishedCareerId}`,
    ],
    ['a non-UUID id', () => `${catalog.publishedCareerId},not-a-uuid`],
  ])('returns 400 for %s', async (_, ids) => {
    const res = await compare(ids()).expect(400);

    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['a draft', () => catalog.draftCareerId],
    ['a retired', () => catalog.retiredCareerId],
    ['an unknown', () => unknownId],
  ])('returns 404 when either career is %s career', async (_, otherId) => {
    await compare(`${catalog.publishedCareerId},${otherId()}`).expect(404);
  });

  it('does not collide with GET /careers/:id', async () => {
    const res = await request(app.getHttpServer())
      .get(`${apiPrefix}/careers/compare`)
      .expect(400);

    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.fields).toHaveProperty('ids');

    await request(app.getHttpServer())
      .get(`${apiPrefix}/careers/${catalog.publishedCareerId}`)
      .expect(200);
  });
});
