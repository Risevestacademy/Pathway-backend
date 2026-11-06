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

describe('Opportunity saves (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let userA: RegisteredUser;
  let userB: RegisteredUser;

  const opportunityIds: string[] = [];
  const marker = `e2e-opportunity-saves-${Date.now()}`;
  const day = 24 * 60 * 60 * 1000;
  const unknownId = '00000000-0000-4000-8000-000000000000';

  const createOpportunity = async (
    data: {
      verification?: OpportunityVerification;
      deadline?: Date | null;
      deadlineUnknown?: boolean;
    } = {},
  ) => {
    const opportunity = await prisma.opportunity.create({
      data: {
        title: `${marker} listing`,
        type: 'INTERNSHIP',
        organisation: 'Acme',
        location: 'Remote',
        description: 'A listing',
        applyUrl: 'https://example.com/apply',
        verification: 'VERIFIED',
        deadline: new Date(Date.now() + 30 * day),
        ...data,
      },
    });
    opportunityIds.push(opportunity.id);
    return opportunity.id;
  };

  const saveUrl = (id: string) => `${apiPrefix}/opportunities/${id}/save`;

  const save = (id: string, token: string) =>
    request(app.getHttpServer())
      .put(saveUrl(id))
      .set('Authorization', `Bearer ${token}`);

  const unsave = (id: string, token: string) =>
    request(app.getHttpServer())
      .delete(saveUrl(id))
      .set('Authorization', `Bearer ${token}`);

  const countSaves = (opportunityId: string, userId: string) =>
    prisma.userSavedOpportunity.count({ where: { opportunityId, userId } });

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
        where: { id: { in: opportunityIds } },
      });
      await cleanupUsers(
        prisma,
        [userA?.id, userB?.id].filter((id): id is string => Boolean(id)),
      );
    }
    if (app) await app.close();
  });

  it('should save then unsave a visible listing', async () => {
    const id = await createOpportunity();

    await save(id, userA.accessToken).expect(200);
    expect(await countSaves(id, userA.id)).toBe(1);

    await unsave(id, userA.accessToken).expect(204);
    expect(await countSaves(id, userA.id)).toBe(0);
  });

  it('should leave one row and return the same savedAt when saved twice', async () => {
    const id = await createOpportunity();

    const first = await save(id, userA.accessToken).expect(200);
    const second = await save(id, userA.accessToken).expect(200);
    const row = await prisma.userSavedOpportunity.findUniqueOrThrow({
      where: { userId_opportunityId: { userId: userA.id, opportunityId: id } },
    });

    expect(first.body).toEqual({
      opportunityId: id,
      savedAt: row.savedAt.toISOString(),
    });
    expect(second.body).toEqual(first.body);
    expect(await countSaves(id, userA.id)).toBe(1);
  });

  it('should leave one row when the same save arrives concurrently', async () => {
    const id = await createOpportunity();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => save(id, userA.accessToken)),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array(5).fill(200),
    );
    expect(await countSaves(id, userA.id)).toBe(1);
  });

  it('should save a rolling listing', async () => {
    const id = await createOpportunity({
      deadline: null,
      deadlineUnknown: true,
    });

    await save(id, userA.accessToken).expect(200);
    expect(await countSaves(id, userA.id)).toBe(1);
  });

  it('should return 204 when removing a save that does not exist', async () => {
    const id = await createOpportunity();

    await unsave(id, userA.accessToken).expect(204);
    await unsave(unknownId, userA.accessToken).expect(204);
  });

  it.each<[string, () => Promise<string>]>([
    ['draft', () => createOpportunity({ verification: 'DRAFT' })],
    ['withdrawn', () => createOpportunity({ verification: 'WITHDRAWN' })],
    [
      'closed',
      () => createOpportunity({ deadline: new Date(Date.now() - day) }),
    ],
    ['unknown', () => Promise.resolve(unknownId)],
  ])('should return 404 when saving a %s listing', async (_label, create) => {
    const id = await create();

    const response = await save(id, userA.accessToken).expect(404);

    expect((response.body as { error: string }).error).toBe('NOT_FOUND');
    expect(await countSaves(id, userA.id)).toBe(0);
  });

  it('should let a user remove a save once the listing has closed', async () => {
    const id = await createOpportunity();
    await save(id, userA.accessToken).expect(200);
    await prisma.opportunity.update({
      where: { id },
      data: { deadline: new Date(Date.now() - day) },
    });

    await unsave(id, userA.accessToken).expect(204);

    expect(await countSaves(id, userA.id)).toBe(0);
  });

  it("should never change another user's save", async () => {
    const id = await createOpportunity();
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
    const id = await createOpportunity();

    await request(app.getHttpServer()).put(saveUrl(id)).expect(401);
    await request(app.getHttpServer()).delete(saveUrl(id)).expect(401);
    await save(id, 'not-a-token').expect(401);
    await unsave(id, 'not-a-token').expect(401);
  });
});
